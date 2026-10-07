import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRuntime, effect } from "@volynets/reflex";
import { reactiveSet, getStoreName } from "../src/advanced";
import { action, reactiveMap, derive, selector, snapshot } from "../src";
import { createStoreCell } from "../src/store/cell";
import { createStoreScope } from "../src/store/scope";
import { compileStore } from "../src/store";

describe("collection and compiler production tooling", () => {
  it("matches native Set across generated mutations", () => {
    createRuntime({ effectStrategy: "flush" });
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            kind: fc.constantFrom("add", "delete", "clear"),
            value: fc.integer({ min: -10, max: 10 }),
          }),
          { maxLength: 100 },
        ),
        (commands) => {
          const native = new Set<number>();
          const reactive = reactiveSet<number>();
          for (const command of commands) {
            if (command.kind === "add") {
              native.add(command.value);
              reactive.add(command.value);
            }
            if (command.kind === "delete")
              expect(reactive.delete(command.value)).toBe(
                native.delete(command.value),
              );
            if (command.kind === "clear") {
              native.clear();
              reactive.clear();
            }
            expect([...reactive]).toEqual([...native]);
            expect(reactive.size).toBe(native.size);
            expect(reactive.has(command.value)).toBe(native.has(command.value));
          }
          reactive[Symbol.dispose]();
        },
      ),
      { seed: 20261007, numRuns: 100 },
    );
  });

  it("keeps membership local, supports Set iteration, and creates immutable snapshots", () => {
    const rt = createRuntime({ effectStrategy: "eager" });
    const set = reactiveSet<number>();
    let a = 0;
    let keys = 0;
    const stops = [
      effect(() => {
        set.has(1);
        a++;
      }),
      effect(() => {
        void [...set];
        keys++;
      }),
    ];
    set.add(2);
    rt.flush();
    expect(a).toBe(1);
    expect(keys).toBe(2);
    set.add(2);
    rt.flush();
    expect(keys).toBe(2);
    set.add(1);
    rt.flush();
    expect(a).toBe(2);
    expect([...set.entries()]).toEqual([
      [2, 2],
      [1, 1],
    ]);
    const saved = snapshot(set);
    expect([...saved]).toEqual([2, 1]);
    expect(() => (saved as Set<number>).add(3)).toThrow(/snapshot/);
    stops.forEach((stop) => stop());
    set.dispose();
    expect(() => set.size).toThrow(/disposed/);
  });

  it("exposes optional names without pulling a lazy derivation", () => {
    createRuntime({ effectStrategy: "flush" });
    const map = reactiveMap<string, number>(undefined, { name: "tasks" });
    const set = reactiveSet(undefined, { name: "selected IDs" });
    const selected = selector(() => "a", { name: "selection" });
    let calls = 0;
    const view = derive(
      () => {
        calls++;
        return { total: map.size };
      },
      { name: "summary" },
    );
    const cell = createStoreCell(1, { name: "board.count" });
    expect([map, set, selected, view, cell].map(getStoreName)).toEqual([
      "tasks",
      "selected IDs",
      "selection",
      "summary",
      "board.count",
    ]);
    expect(calls).toBe(0);
    map.dispose();
    set.dispose();
    selected.dispose();
    view[Symbol.dispose]();
    cell.dispose();
  });

  it("erases a facade only when all uses lower to data cells", () => {
    const source =
      "const state=createStore({count:0}); state.count++; const result=state.count;";
    const code = compileStore(source, "erasure.js", {
      importRuntime: false,
      eraseFacade: true,
    }).code;
    expect(code).not.toContain("get count");
    expect(code).not.toContain("const state");
    createRuntime({ effectStrategy: "flush" });
    const result = new Function(
      "__reflex_createStoreScope",
      "__reflex_signal",
      code + "\nreturn result;",
    )(createStoreScope, createStoreCell);
    expect(result).toBe(1);

    const escaped = compileStore(
      "function make(){const state=createStore({count:0});return state;}",
      "escaped.js",
      { importRuntime: false, eraseFacade: true },
    ).code;
    expect(escaped).toContain("get count");
  });

  it("rejects asynchronous actions and non-object derivations", () => {
    // @ts-expect-error async callbacks are outside the action contract
    expect(() => action(async () => {})).toThrow(/synchronous/);
    const callback = () => Promise.resolve();
    // @ts-expect-error promise results are outside the action contract
    expect(() => action(callback)()).toThrow(/promise/);
    const invalid = derive(() => []);
    expect(() => invalid.length).toThrow(/plain object/);
    invalid[Symbol.dispose]();
  });

  it("rejects general reflection even inside factory returns", () => {
    expect(() =>
      compileStore(
        "function make(){const state=createStore({a:0});return JSON.stringify(state);}",
      ),
    ).toThrow(/reflection/);
  });

  it("validates bound this paths and rejects getters calling actions", () => {
    expect(() =>
      compileStore("const state=createStore({a:0,update(){this.missing=1}});"),
    ).toThrow(/declared compiled-store leaves/);
    expect(() =>
      compileStore(
        "const state=createStore({a:0,read(key){return this[key]}});",
      ),
    ).toThrow(/Dynamic compiled-store/);
    expect(() =>
      compileStore(
        "const state=createStore({a:0,update(){this.a++},get invalid(){this.update();return this.a}});",
      ),
    ).toThrow(/getters cannot call store actions/);
  });

  it("rejects getters that mutate state and async actions", () => {
    expect(() =>
      compileStore(
        "const state=createStore({a:0,get invalid(){this.a++;return this.a}});",
      ),
    ).toThrow(/getters cannot write/);
    expect(() =>
      compileStore("const state=createStore({a:0,async update(){this.a=1}});"),
    ).toThrow(/synchronous/);
  });
});
