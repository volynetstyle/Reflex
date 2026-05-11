import { describe, expect, it } from "vitest";
import { createModel } from "../../../reflex/src/infra/model";
import { signal } from "../../../reflex/src/api/signal";
import { createRuntime, effect } from "../../../reflex/tests/reflex.test_utils";
import {
  CompiledStoreTransformError,
  compileStore,
  transformCompiledStore,
} from "../src/store";

describe("transformCompiledStore", () => {
  it("lowers createStore declarations to runtime-backed model state", () => {
    const source = [
      'import { createStore } from "@reflex/store";',
      'const state = createStore({ user: { name: "Alice" }, count: 0 });',
      "const name = state.user.name;",
      "const count = state.count;",
    ].join("\n");

    const result = compileStore(source);

    expect(result.code).toContain(
      'import { createModel as __reflex_createModel, signal as __reflex_signal } from "@volynets/reflex";',
    );
    expect(result.code).not.toContain('from "@reflex/store"');
    expect(result.code).toContain(
      'const [__read_user_name, __set_user_name] = __reflex_signal("Alice");',
    );
    expect(result.code).toContain(
      "const [__read_count, __set_count] = __reflex_signal(0);",
    );
    expect(result.code).toContain(
      "const state = __reflex_createModel((ctx)=>",
    );
    expect(result.code).toContain("get name");
    expect(result.code).toContain("set name");
    expect(result.code).toContain("const name = __read_user_name()");
    expect(result.code).toContain("const count = __read_count()");
  });

  it("rewrites static leaf reads into generated accessor calls", () => {
    const source = [
      'const state = createStore({ user: { name: "Alice" }, count: 0 });',
      "const name = state.user.name;",
      "const count = state.count;",
    ].join("\n");

    const result = transformCompiledStore(source);

    expect(result.code).toContain("const name = __read_user_name()");
    expect(result.code).toContain("const count = __read_count()");
  });

  it("rewrites plain and compound assignments", () => {
    const source = [
      'const state = createStore({ user: { name: "Alice" }, count: 0 });',
      'state.user.name = "Bob";',
      "state.count += 2;",
    ].join("\n");

    const result = transformCompiledStore(source);

    expect(result.code).toContain('__write_user_name("Bob")');
    expect(result.code).toContain("const __rhs_");
    expect(result.code).toContain("__write_count(__next_");
  });

  it("rewrites postfix and prefix updates", () => {
    const source = [
      "const state = createStore({ count: 0 });",
      "state.count++;",
      "++state.count;",
    ].join("\n");

    const result = transformCompiledStore(source);

    expect(result.code).toContain("const __prev_");
    expect(result.code).toContain("return __prev_");
    expect(result.code).toContain("const __next_");
    expect(result.code).toContain("return __next_");
  });

  it("runs compiled store code with model getters, setters, and hot-path writes", () => {
    const source = [
      'const state = createStore({ user: { name: "Alice" }, count: 0 });',
      'const rt = createRuntime({ effectStrategy: "flush" });',
      "const seen = [];",
      "effect(() => {",
      '  seen.push(`${state.user.name}:${state.count}`);',
      "});",
      'state.user.name = "Bob";',
      "state.count += 2;",
      "rt.flush();",
      "const post = state.count++;",
      "const pre = ++state.count;",
      "rt.flush();",
    ].join("\n");
    const result = compileStore(source, "compiled-store.ts", {
      importRuntime: false,
    });
    const run = new Function(
      "__reflex_createModel",
      "__reflex_signal",
      "createRuntime",
      "effect",
      `${result.code}
return {
  count: state.count,
  name: state.user.name,
  post,
  pre,
  seen,
};`,
    );

    expect(run(createModel, signal, createRuntime, effect)).toEqual({
      count: 4,
      name: "Bob",
      post: 2,
      pre: 4,
      seen: ["Alice:0", "Bob:2", "Bob:4"],
    });
  });

  it("reports DX diagnostics for unsupported phase-1 syntax", () => {
    const cases = [
      {
        source: "const state = createStore({ count: 0 }); state[key];",
        message:
          "Dynamic compiled-store access is not supported in phase 1.",
      },
      {
        source:
          "const state = createStore({ user: { name: 'Ada' } }); const user = state.user;",
        message:
          "Aliasing nested compiled-store branches is not supported in phase 1.",
      },
      {
        source: "const state = createStore({ count: 0 }); Object.keys(state);",
        message:
          "Spread and reflection are not guaranteed for compiled stores in phase 1.",
      },
      {
        source: "const state = createStore({ count: 0 }); const copy = { ...state };",
        message:
          "Spread and reflection are not guaranteed for compiled stores in phase 1.",
      },
      {
        source: "const state = createStore({ count: 0 }); const { count } = state;",
        message:
          "Spread and reflection are not guaranteed for compiled stores in phase 1.",
      },
    ];

    for (const testCase of cases) {
      expect(() => compileStore(testCase.source)).toThrow(
        CompiledStoreTransformError,
      );
      expect(() => compileStore(testCase.source)).toThrow(testCase.message);
    }
  });
});
