import { describe, expect, it } from "vitest";
import { createModel } from "../../reflex/src/infra/model";
import {
  computed,
  createRuntime,
  effect,
  signal,
} from "../../reflex/tests/reflex.test_utils";
import {
  createProducer,
  createWatcher,
  disposeWatcher,
  readProducer,
  runWatcher,
  writeProducer,
} from "@volynets/reflex-runtime/internal";
import {
  action,
  collectStore,
  createKeyedProjection,
  createReactiveMap,
  createSelector,
  createStoreCell,
  createStoreProjection,
  disposeStore,
  transaction,
} from "../src/advanced";
import { compileStore } from "../src/store";

describe.each(["flush", "eager", "sab"] as const)(
  "headless model integration (%s)",
  (effectStrategy) => {
    it("wraps multi-write callbacks in one action batch", () => {
      const rt = createRuntime({ effectStrategy });
      const left = signal(0);
      const right = signal(0);
      const seen: number[][] = [];
      const stop = effect(() => {
        seen.push([left(), right()]);
      });
      const update = action(() => {
        left.set(1);
        right.set(2);
      });

      update();
      rt.flush();

      expect(seen).toEqual([
        [0, 0],
        [1, 2],
      ]);
      stop();
    });

    it("owns collections/projections/selectors and publishes one coherent action", () => {
      const rt = createRuntime({ effectStrategy });
      const selected = signal("a");
      const tasks = createReactiveMap([
        ["a", { title: "Ada", done: false }],
        ["b", { title: "Grace", done: false }],
      ]);
      const isSelected = createSelector(selected);
      const title = createKeyedProjection(
        () => ({ id: selected(), value: tasks.get(selected())! }),
        (x) => x.id,
        (x) => x.value.title,
      );
      const summary = createStoreProjection(
        () => ({
          count: tasks.size,
          done: [...tasks.values()].filter((x) => x.done).length,
          title: title(selected()),
          selected: isSelected("b"),
        }),
        {},
      );
      const seen: unknown[] = [];
      const createBoard = createModel((ctx) => {
        ctx.onDispose(() => tasks.dispose());
        ctx.onDispose(() => isSelected.dispose());
        ctx.onDispose(() => title.dispose());
        ctx.onDispose(() => disposeStore(summary));
        ctx.onDispose(
          effect(() => {
            seen.push([
              summary.count,
              summary.done,
              summary.title,
              summary.selected,
            ]);
          }),
        );
        return {
          title: () => summary.title,
          finishAndSelect: ctx.action(() => {
            tasks.set("a", { title: "Ada", done: true });
            selected.set("b");
            tasks.set("b", { title: "Grace Hopper", done: true });
          }),
        };
      });
      const board = createBoard();
      expect(seen).toEqual([[2, 0, "Ada", false]]);
      board.finishAndSelect();
      expect(board.title()).toBe("Grace Hopper");
      rt.flush();
      expect(seen).toEqual([
        [2, 0, "Ada", false],
        [2, 2, "Grace Hopper", true],
      ]);
      board.dispose();
      board.dispose();
      selected.set("a");
      rt.flush();
      expect(seen).toHaveLength(2);
      expect(() => tasks.get("a")).toThrow(/disposed/);
      expect(() => summary.title).toThrow(/disposed/);
    });

    it("recovers projection evaluation after an exception without publishing a failed draft", () => {
      createRuntime({ effectStrategy });
      const input = signal(1);
      let attempts = 0;
      const view = createStoreProjection<{
        value: number;
        accumulated: number;
      }>(
        (draft) => {
          attempts++;
          const value = input();
          draft.accumulated++;
          if (value < 0) throw new Error("invalid");
          draft.value = value;
        },
        { value: 0, accumulated: 0 },
      );
      expect(view.value).toBe(1);
      input.set(-1);
      expect(() => view.value).toThrow("invalid");
      input.set(2);
      expect(view.value).toBe(2);
      expect(view.accumulated).toBe(2);
      expect(attempts).toBe(3);
      collectStore(view);
      disposeStore(view);
    });

    it("keeps identity-based selector invalidation off unrelated key nodes", () => {
      const rt = createRuntime({ effectStrategy });
      const selected = signal(1);
      const isSelected = createSelector(selected);
      const watchers = [1, 2, 3].map((key) => {
        const watcher = createWatcher(() => {
          isSelected(key);
        });
        runWatcher(watcher);
        return watcher;
      });
      const unrelated = watchers[2]!.firstIn!.from;
      const state = unrelated.state;
      selected.set(2);
      rt.flush();
      expect(unrelated.state).toBe(state);
      watchers.forEach(disposeWatcher);
      isSelected.collect();
      isSelected.dispose();
    });
  },
);

describe("static cell and application lifetimes", () => {
  it("creates producers only for tracked reads and releases collected cells", () => {
    createRuntime();
    const cell = createStoreCell(0);
    cell.set(1);
    expect(cell()).toBe(1);
    const watcher = createWatcher(() => {
      cell();
    });
    runWatcher(watcher);
    const first = watcher.firstIn!.from;
    expect(cell()).toBe(1);
    disposeWatcher(watcher);
    cell.collect();
    expect(first.payload).toBeUndefined();
    cell.set(2);
    const next = createWatcher(() => {
      cell();
    });
    runWatcher(next);
    expect(next.firstIn!.from).not.toBe(first);
    expect(cell()).toBe(2);
    disposeWatcher(next);
    cell.dispose();
    expect(() => cell()).toThrow(/disposed/);
  });

  it("disposes default compiled cells through the generated model lifetime", () => {
    createRuntime();
    const source = "const state=createStore({count:1}); state.count++;";
    const code = compileStore(source, "model.js", {
      importRuntime: false,
    }).code;
    const cells: ReturnType<typeof createStoreCell<number>>[] = [];
    const factory = (value: number) => {
      const cell = createStoreCell(value);
      cells.push(cell);
      return cell;
    };
    const model = new Function(
      "__reflex_createModel",
      "__reflex_signal",
      code + "return state;",
    )(createModel, factory);
    expect(model.count).toBe(2);
    model.dispose();
    expect(() => cells[0]!()).toThrow(/disposed/);
  });

  it("collects a composed graph downstream to upstream and can reactivate it", () => {
    const rt = createRuntime();
    const source = createProducer({ id: "a", count: 1 });
    const keyed = createKeyedProjection(
      () => readProducer(source),
      (x) => x.id,
      (x) => x.count,
    );
    const projected = createStoreProjection(() => ({ count: keyed("a") }), {});
    const output: unknown[] = [];
    let stop = effect(() => {
      output.push(projected.count);
    });
    stop();
    collectStore(projected);
    keyed.collect();
    expect(source.firstOut).toBeNull();
    writeProducer(source, { id: "a", count: 2 });
    stop = effect(() => {
      output.push(projected.count);
    });
    rt.flush();
    expect(output).toEqual([1, 2]);
    stop();
    disposeStore(projected);
    keyed.dispose();
    expect(source.firstOut).toBeNull();
  });

  it("does not leak action reads into the invoking computed", () => {
    const rt = createRuntime();
    const map = createReactiveMap([["a", 1]]);
    const trigger = signal(0);
    const createActions = createModel((ctx) => ({
      peek: ctx.action(() => map.get("a")),
    }));
    const actions = createActions();
    let runs = 0;
    const value = computed(() => {
      trigger();
      runs++;
      return actions.peek();
    });
    expect(value()).toBe(1);
    transaction(() => map.set("a", 2));
    rt.flush();
    expect(value()).toBe(1);
    expect(runs).toBe(1);
    trigger.set(1);
    expect(value()).toBe(2);
    actions.dispose();
    map.dispose();
  });
});

describe("foreign references and structural edge cases", () => {
  it("observes opaque class instances, dates and typed arrays without instrumenting them", () => {
    const rt = createRuntime();
    class Engine {
      constructor(readonly id: number) {}
    }
    const first = new Engine(1),
      second = new Engine(2);
    const map = createReactiveMap<string, object>([
      ["engine", first],
      ["date", new Date(0)],
      ["bytes", new Uint8Array([1])],
    ]);
    const cell = createStoreCell<object>(first);
    const seen: object[] = [];
    const stop = effect(() => {
      seen.push(map.get("engine")!);
      void map.get("date");
      void map.get("bytes");
      cell();
    });
    map.set("engine", second);
    cell.set(second);
    rt.flush();
    expect(seen).toEqual([first, second]);
    expect(map.get("engine")).toBe(second);
    expect(cell()).toBe(second);
    stop();
    map.dispose();
    cell.dispose();
  });

  it("observes descriptor enumerability without observing property values", () => {
    const rt = createRuntime();
    const source = signal(
      Object.defineProperty({}, "x", { value: 1, enumerable: false }),
    );
    const view = createStoreProjection(() => source(), {});
    const seen: string[][] = [];
    const stop = effect(() => {
      seen.push(Object.keys(view));
    });
    source.set(Object.defineProperty({}, "x", { value: 2, enumerable: false }));
    rt.flush();
    expect(seen).toEqual([[]]);
    source.set(Object.defineProperty({}, "x", { value: 2, enumerable: true }));
    rt.flush();
    expect(seen).toEqual([[], ["x"]]);
    stop();
    disposeStore(view);
  });

  it("releases a selector router at collection and reattaches with current state", () => {
    const rt = createRuntime();
    const source = createProducer("a");
    const selected = createSelector(() => readProducer(source));
    const stop = effect(() => {
      selected("a");
    });
    expect(source.firstOut).not.toBeNull();
    stop();
    selected.collect();
    expect(source.firstOut).toBeNull();
    writeProducer(source, "b");
    const seen: boolean[] = [];
    const next = effect(() => {
      seen.push(selected("b"));
    });
    writeProducer(source, "a");
    rt.flush();
    expect(seen).toEqual([true, false]);
    next();
    selected.dispose();
    expect(source.firstOut).toBeNull();
  });
});
