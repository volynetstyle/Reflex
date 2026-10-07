import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createModel } from "../../reflex/src/infra/model";
import { createRuntime } from "../../reflex/tests/reflex.test_utils";
import { createStoreCell } from "../src/store/cell";
import { compileStore } from "../src/store";

function execute(code: string, compiled: boolean) {
  createRuntime({ effectStrategy: "flush" });
  const body = compiled
    ? compileStore(code, "differential.js", { importRuntime: false }).code
    : code;
  return new Function(
    "createStore",
    "__reflex_createModel",
    "__reflex_signal",
    body + "\nreturn output;",
  )((value: unknown) => value, createModel, createStoreCell);
}
function compare(code: string) {
  expect(execute(code, true)).toEqual(execute(code, false));
}

describe("compiled store / JavaScript differential semantics", () => {
  it("preserves compound RHS ordering, reentrant writes and single evaluation", () => {
    compare(
      [
        "const state = createStore({ count: 1 }); let calls = 0;",
        "function rhs() { calls++; state.count = 10; return 2; }",
        "const output = [];",
        "output.push(state.count += rhs(), state.count, calls);",
        "output.push(state.count -= (state.count = 20), state.count);",
      ].join("\n"),
    );
  });

  it.each(["'2'", "null", "undefined", "true", "1n", "-0", "NaN"])(
    "preserves ToNumeric for %s",
    (initial) => {
      compare(
        "const state = createStore({ count: " +
          initial +
          " }); const output = [];\n" +
          "output.push(state.count++, state.count, ++state.count, state.count--, --state.count);",
      );
    },
  );

  it("preserves exceptions before commit and subsequent recovery", () => {
    compare(
      [
        "const state = createStore({ count: 1 }); const output = [];",
        "function fail() { output.push(state.count); throw Error('rhs'); }",
        "try { state.count += fail(); } catch (error) { output.push(error.message); }",
        "output.push(state.count, state.count += 2);",
        "state.count = Symbol('bad');",
        "try { state.count++; } catch (error) { output.push(error.name, typeof state.count); }",
        "state.count = 4; output.push(++state.count);",
      ].join("\n"),
    );
  });

  it("keeps multiple stores, mangled paths and user temporaries distinct", () => {
    compare(
      [
        "const __read_count = 99; const __rhs_1 = 3;",
        "const left = createStore({ count: 1, a_b: { c: 2 }, a: { b_c: 3 }, empty: {} });",
        "const right = createStore({ count: 10 });",
        "left.count++; right.count += left.count;",
        "const output = [left.count, right.count, left.a_b.c, left.a.b_c, __read_count, __rhs_1];",
        "output.push(left.empty === left.empty);",
      ].join("\n"),
    );
  });

  it("recognizes import aliases and keeps shadowed factory/store bindings independent", () => {
    const code = [
      "import { createStore as makeStore } from '@volynets/reflex-store';",
      "const state = makeStore({ count: 1 });",
      "function local(state, makeStore) { const x = makeStore(); return state['count'] + x; }",
      "const unrelated = { value: 7 };",
      "const output = [local({count: 20}, () => 2), state.count, unrelated?.value];",
    ].join("\n");
    const transformed = compileStore(code, "alias.js", {
      importRuntime: false,
    }).code;
    expect(
      new Function(
        "__reflex_createModel",
        "__reflex_signal",
        transformed + "return output;",
      )(createModel, createStoreCell),
    ).toEqual([22, 1, 7]);
    expect(transformed).not.toContain("import");
  });

  it("does not recognize a local or foreign factory by spelling alone", () => {
    const local =
      "function createStore(x) { return x; } const state = createStore({count:1}); const output = state.count;";
    expect(compileStore(local).code).not.toContain("__reflex_");
    expect(
      compileStore(
        "import {createStore} from 'foreign'; const state=createStore({count:1});",
      ).code,
    ).toContain("from 'foreign'");
  });

  it("matches 200 generated programs containing assignments and updates", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            operator: fc.constantFrom(
              "=",
              "+=",
              "-=",
              "post++",
              "pre++",
              "post--",
              "pre--",
              "reentrant",
            ),
            value: fc.integer({ min: -20, max: 20 }),
            leaf: fc.constantFrom("count", "nested.value"),
          }),
          { minLength: 1, maxLength: 60 },
        ),
        (operations) => {
          const body = operations
            .map(({ operator, value, leaf }) => {
              const path = "state." + leaf;
              const expression =
                operator === "post++"
                  ? path + "++"
                  : operator === "pre++"
                    ? "++" + path
                    : operator === "post--"
                      ? path + "--"
                      : operator === "pre--"
                        ? "--" + path
                        : operator === "reentrant"
                          ? path + " += (" + path + " = " + value + ")"
                          : path + " " + operator + " " + value;
              return (
                "output.push(" +
                expression +
                ", state.count, state.nested.value);"
              );
            })
            .join("\n");
          compare(
            "const state=createStore({count:1,nested:{value:2}}); const output=[];\n" +
              body,
          );
        },
      ),
      { seed: 20261007, numRuns: 200 },
    );
  });

  it.each([
    "const state=createStore({count:1}); delete state.count;",
    "const state=createStore({count:1}); state.count *= 2;",
    "const state=createStore({count:1}); state.extra = 2;",
    "const state=createStore({user:{name:'Ada'}}); state.user = {};",
    "const state=createStore({...base});",
    "const state=createStore({count:1,count:2});",
    "const state=createStore({get count(){return 1}});",
    "const state=createStore({__proto__: null});",
    "const state=createStore(data);",
    "import {createStore} from '@volynets/reflex-store'; function f(){return createStore({count:0});}",
  ])("diagnoses unsupported semantics without partial erasure: %s", (code) => {
    expect(() => compileStore(code)).toThrow();
    const result = compileStore(code, "unsupported.ts", {
      onDiagnostic: "collect",
    });
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.code).toBe(code);
  });
});
