import { describe, expect, it } from "vitest";
import {
  createModel,
  createDisposableComputed,
  createRuntime,
  effect,
  own,
  signal,
} from "@volynets/reflex";
import { compileStore } from "../src/store";
import { createStoreCell } from "../src/store/cell";
import {
  action,
  derive,
  hydrate,
  leaf,
  opaque,
  reactiveMap,
  selector,
  snapshot,
} from "../src";
import { createKeyedProjection, createProjection } from "../src/advanced";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- executable JavaScript scenarios return different shapes.
function compileAndRun(body: string): any {
  const source =
    'import { createStore, snapshot, hydrate, leaf, opaque } from "@volynets/reflex-store";\n' +
    'import {own, createModel} from "@volynets/reflex-store/runtime";\n' +
    "function run(){\n" +
    body +
    "\n}\nconst output=run();";
  const output = compileStore(source, "production.js", {
    importRuntime: false,
  }).code.replace(/import\s*\{[^}]*\}\s*from\s*["'][^"']*["'];?/g, "");
  return new Function(
    "__reflex_createModel",
    "__reflex_signal",
    "__reflex_createDisposableComputed",
    "effect",
    "snapshot",
    "hydrate",
    "leaf",
    "opaque",
    "own",
    "createModel",
    output + "\nreturn output;",
  )(
    createModel,
    createStoreCell,
    createDisposableComputed,
    effect,
    snapshot,
    hydrate,
    leaf,
    opaque,
    own,
    createModel,
  );
}

describe("production store contracts", () => {
  it.each(["flush", "eager", "sab"] as const)(
    "compiles methods as coherent actions and getters as lazy computeds (%s)",
    (effectStrategy) => {
      const rt = createRuntime({ effectStrategy });
      const result = compileAndRun(
        [
          "let calls = 0; const renders = [];",
          "const state = createStore({a:0,b:0, get sum(){calls++;return this.a+this.b},",
          "update(){this.a=1;this.b=2;return this.sum}});",
          "const stop = effect(()=>{renders.push(state.sum)});",
          "const initial = calls; const cached = [state.sum,state.sum,calls];",
          "state.update(); return {state,renders,stop,cached,initial,getCalls:()=>calls};",
        ].join("\n"),
      );
      rt.flush();
      expect(result.cached).toEqual([0, 0, 1]);
      expect(result.renders).toEqual([0, 3]);
      expect(result.getCalls()).toBe(2);
      result.stop();
      result.state[Symbol.dispose]();
      expect(() => result.state.a).toThrow(/disposed/);
      expect(() => result.state.sum).toThrow(/disposed/);
      expect(() => result.state.update()).toThrow(/disposed/);
      expect(() => hydrate(result.state, { a: 0, b: 0 })).toThrow(/disposed/);
    },
  );

  it("supports factory isolation, static snapshots and validated batched hydration", () => {
    const rt = createRuntime({ effectStrategy: "eager" });
    const result = compileAndRun(
      [
        "function make(){const state=createStore({nested:{a:1,b:2}, get sum(){return this.nested.a+this.nested.b}, update(){this.nested.a=8}});return state}",
        "const state=make(); const other=make(); const seen=[];",
        "const stop=effect(()=>{seen.push(state.sum)});",
        "const saved=snapshot(state); hydrate(state,{nested:{a:4,b:5}});",
        "let failed=false;try{hydrate(state,{nested:{a:9}})}catch{failed=true}",
        "return {state,other,saved,seen,failed,stop};",
      ].join("\n"),
    );
    rt.flush();
    expect(result.saved).toEqual({ nested: { a: 1, b: 2 } });
    expect(Object.isFrozen(result.saved.nested)).toBe(true);
    expect(result.seen).toEqual([3, 9]);
    expect(result.failed).toBe(true);
    expect(result.state.nested.a).toBe(4);
    expect(result.other.nested.a).toBe(1);
    result.stop();
    result.state.dispose();
    result.other.dispose();
  });

  it("snapshot reads are untracked and object boundaries preserve reference semantics", () => {
    const rt = createRuntime({ effectStrategy: "eager" });
    const result = compileAndRun(
      [
        "const engine={handle:1};",
        "const state=createStore({object:leaf({value:1}),engine:opaque(engine)});",
        "let runs=0;const stop=effect(()=>{snapshot(state);runs++});",
        "const saved=snapshot(state);state.object={value:2};",
        "return {state,saved,engine,stop,getRuns:()=>runs};",
      ].join("\n"),
    );
    rt.flush();
    expect(result.getRuns()).toBe(1);
    expect(result.saved.object.value).toBe(1);
    expect(result.saved.engine).toBe(result.engine);
    result.stop();
    result.state.dispose();
  });

  it("restores mutable collections and preserves cycles and shared leaf references", () => {
    createRuntime({ effectStrategy: "flush" });
    const result = compileAndRun(
      [
        "const shared={value:1};shared.self=shared;",
        "const state=createStore({first:leaf(shared),second:leaf(shared),map:leaf(new Map([['key',shared]])),set:leaf(new Set([shared]))});",
        "const saved=snapshot(state);hydrate(state,saved);",
        "state.map.set('new',2);state.set.add('new');",
        "return {state,saved,shared};",
      ].join("\n"),
    );
    expect(result.state.first).toBe(result.state.second);
    expect(result.state.first.self).toBe(result.state.first);
    expect(result.state.map.get("key")).toBe(result.state.first);
    expect(result.saved.map.has("new")).toBe(false);
    expect(result.saved.set.has("new")).toBe(false);
    expect(result.state.set.has(result.shared)).toBe(true);
    result.state.dispose();
  });

  it("registers compiled stores directly with a parent owner", () => {
    createRuntime({ effectStrategy: "flush" });
    const model = compileAndRun(
      [
        "const factory=createModel(ctx=>{const state=createStore({count:0,increment(){this.count++}});",
        "own(ctx,state);return {state};});return factory();",
      ].join("\n"),
    );
    model.state.increment();
    expect(model.state.count).toBe(1);
    model.dispose();
    expect(() => model.state.count).toThrow(/disposed/);
    expect(() => model.state.increment()).toThrow(/disposed/);
  });

  it("owns every runtime resource through Symbol.dispose", () => {
    createRuntime({ effectStrategy: "flush" });
    const source = signal("a");
    const model = createModel((ctx) => {
      const map = own(ctx, reactiveMap([["a", 1]]));
      const selected = own(ctx, selector(source));
      const view = own(
        ctx,
        derive(() => ({ value: map.get("a") })),
      );
      const keyed = own(
        ctx,
        createKeyedProjection(
          source,
          (id) => id,
          (id) => id,
        ),
      );
      const draft = own(
        ctx,
        createProjection<{ value: number }>(() => ({ value: 1 }), {}),
      );
      return { map, selected, view, keyed, draft };
    })();
    expect(model.view.value).toBe(1);
    model.dispose();
    model[Symbol.dispose]();
    expect(() => model.map.get("a")).toThrow(/disposed/);
    expect(() => model.selected("a")).toThrow(/disposed/);
    expect(() => model.view.value).toThrow(/disposed/);
    expect(() => model.keyed("a")).toThrow(/disposed/);
    expect(() => model.draft.value).toThrow(/disposed/);
  });

  it("retains action receiver and closes batches on exceptions", () => {
    const rt = createRuntime({ effectStrategy: "eager" });
    const map = reactiveMap([["a", 0]]);
    const seen: number[] = [];
    const stop = effect(() => {
      seen.push(map.get("a")!);
    });
    const receiver = {
      amount: 2,
      update: action(function (this: { amount: number }) {
        map.set("a", this.amount);
        throw new Error("action failed");
      }),
    };
    expect(() => receiver.update()).toThrow("action failed");
    rt.flush();
    expect(seen).toEqual([0, 2]);
    stop();
  });
});
