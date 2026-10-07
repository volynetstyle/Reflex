import { describe, expect, it, vi } from "vitest";
import { createRuntime, effect, signal } from "@volynets/reflex";
import { createStoreScope, type StoreScope } from "../src/store/scope";
import { createStoreCell } from "../src/store/cell";
import { compileStore } from "../src/store";

describe("Store scope over Framework lifecycle", () => {
  it("owns resources, aborts its signal, and disposes in reverse order once", () => {
    const events: string[] = [];
    let scope!: StoreScope;
    const first = Object.freeze({
      [Symbol.dispose]() {
        events.push("first");
      },
    });
    const value = createStoreScope((context) => {
      scope = context;
      expect(context.own(first)).toBe(first);
      context.own({
        [Symbol.dispose]() {
          events.push("second");
        },
      });
      return { label: "state" };
    });
    const lifetime = scope.signal;
    expect(lifetime.aborted).toBe(false);
    expect(value.label).toBe("state");
    value[Symbol.dispose]();
    value.dispose();
    expect(events).toEqual(["second", "first"]);
    expect(lifetime.aborted).toBe(true);
    expect(scope.disposed).toBe(true);
    expect(() => scope.own(first)).toThrow(/disposed/);
  });

  it("rolls back setup while preserving its cause and continuing cleanup", () => {
    const cause = new Error("setup failed");
    const cleanupError = new Error("cleanup failed");
    const clean = vi.fn();
    let lifetime!: AbortSignal;
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() =>
        createStoreScope((scope) => {
          lifetime = scope.signal;
          scope.own({ [Symbol.dispose]: clean });
          scope.own({
            [Symbol.dispose]() {
              throw cleanupError;
            },
          });
          throw cause;
        }),
      ).toThrow(cause);
      expect(lifetime.aborted).toBe(true);
      expect(clean).toHaveBeenCalledOnce();
      expect(report).toHaveBeenCalledWith(
        "Ownership cleanup error:",
        cleanupError,
      );
    } finally {
      report.mockRestore();
    }
  });

  it("rolls back if the result cannot expose disposal", () => {
    const clean = vi.fn();
    expect(() =>
      createStoreScope((scope) => {
        scope.own({ [Symbol.dispose]: clean });
        return Object.freeze({});
      }),
    ).toThrow(TypeError);
    expect(clean).toHaveBeenCalledOnce();
  });

  it.each(["eager", "flush", "sab"] as const)(
    "batches actions and preserves receiver, arguments and return value (%s)",
    (effectStrategy) => {
      const runtime = createRuntime({ effectStrategy });
      const a = signal(0);
      const b = signal(0);
      const seen: number[] = [];
      const stop = effect(() => {
        seen.push(a() + b());
      });
      const value = createStoreScope((scope) => ({
        update: scope.action(function (
          this: { factor: number },
          amount: number,
        ) {
          a.set(amount * this.factor);
          b.set(amount);
          return a() + b();
        }),
      }));
      expect(value.update.call({ factor: 2 }, 3)).toBe(9);
      runtime.flush();
      expect(seen).toEqual([0, 9]);
      value.dispose();
      expect(() => value.update.call({ factor: 1 }, 4)).toThrow(/disposed/);
      stop();
    },
  );

  it("executes action reads without subscribing their caller", () => {
    createRuntime({ effectStrategy: "eager" });
    const source = signal(1);
    const value = createStoreScope((scope) => ({
      read: scope.action(() => source()),
    }));
    const seen: number[] = [];
    const stop = effect(() => {
      seen.push(value.read());
    });
    source.set(2);
    expect(seen).toEqual([1]);
    stop();
    value.dispose();
  });

  it("rejects async actions and Promise-like results", () => {
    expect(() =>
      createStoreScope((scope) => {
        // @ts-expect-error Store actions are synchronous.
        scope.action(async () => {});
        return {};
      }),
    ).toThrow(/synchronous/);
    const value = createStoreScope((scope) => ({
      // @ts-expect-error Promise results are outside the synchronous action contract.
      run: scope.action(() => Promise.resolve()),
    }));
    expect(() => value.run()).toThrow(/promise/);
    value.dispose();
  });

  it("owns callable Store cells through Symbol.dispose", () => {
    let cell!: ReturnType<typeof createStoreCell<number>>;
    const value = createStoreScope((scope) => {
      cell = scope.own(createStoreCell(1));
      return {};
    });
    value.dispose();
    expect(() => cell()).toThrow(/disposed/);
    expect(() => cell.set(2)).toThrow(/disposed/);
  });
});

describe("compiled Store lifetime construction", () => {
  it("uses the Store scope and contains no model setup or capability brands", () => {
    const code = compileStore(
      "const state=createStore({count:0,get doubled(){return this.count*2},increment(){this.count++}});",
    ).code;
    expect(code).toContain("createStoreScope as __reflex_createStoreScope");
    expect(code).toContain("ctx.own(__reflex_signal(0))");
    expect(code).not.toContain("createModel");
    expect(code).not.toContain("defineModel");
    expect(code).not.toContain(".onDispose");
  });

  it("rolls back earlier cells when a later initializer throws", () => {
    const cells: ReturnType<typeof createStoreCell<number>>[] = [];
    const code = compileStore(
      "const state=createStore({first:1,second:fail()});",
      "rollback.js",
      { importRuntime: false },
    ).code;
    const cause = new Error("initializer failed");
    const execute = new Function(
      "__reflex_createStoreScope",
      "__reflex_signal",
      "fail",
      code,
    );
    expect(() =>
      execute(
        createStoreScope,
        (value: number) => {
          const cell = createStoreCell(value);
          cells.push(cell);
          return cell;
        },
        () => {
          throw cause;
        },
      ),
    ).toThrow(cause);
    expect(cells).toHaveLength(1);
    expect(() => cells[0]!()).toThrow(/disposed/);
  });

  it("rolls back cells when computed construction fails", () => {
    const cells: ReturnType<typeof createStoreCell<number>>[] = [];
    const code = compileStore(
      "const state=createStore({count:1,get doubled(){return this.count*2}});",
      "getter-rollback.js",
      { importRuntime: false },
    ).code;
    const cause = new Error("computed failed");
    const execute = new Function(
      "__reflex_createStoreScope",
      "__reflex_signal",
      "__reflex_createDisposableComputed",
      code,
    );
    expect(() =>
      execute(
        createStoreScope,
        (value: number) => {
          const cell = createStoreCell(value);
          cells.push(cell);
          return cell;
        },
        () => {
          throw cause;
        },
      ),
    ).toThrow(cause);
    expect(() => cells[0]!()).toThrow(/disposed/);
  });

  it("runs direct custom scope targets and legacy curried targets", () => {
    const source =
      "const state=createStore({count:1});state.count++;const output=state.count;";
    for (const legacy of [false, true]) {
      const code = compileStore(source, "custom.js", {
        importRuntime: false,
        loweringTarget: {
          runtimeModule: "custom-runtime",
          ...(legacy
            ? { model: { exportName: "factory", localName: "target" } }
            : { scope: { exportName: "setup", localName: "target" } }),
          signal: { exportName: "cell", localName: "cell" },
        },
      }).code;
      const direct = (
        setup: (scope: { action: (fn: unknown) => unknown }) => object,
      ) => setup({ action: (fn) => fn });
      const target = legacy
        ? (setup: Parameters<typeof direct>[0]) => () => direct(setup)
        : direct;
      const execute = new Function("target", "cell", code + "\nreturn output;");
      expect(execute(target, createStoreCell)).toBe(2);
    }
  });
});
