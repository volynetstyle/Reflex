import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  STATE_FLAG_NAMES,
  collectConstants,
  inlineConstants,
} from "../../../config/rollup/inline-constants";
import { readRuntimeSources } from "../../../config/rollup/plugins/inline-constants";

const SOURCES = path.resolve(__dirname, "../../../src");
const sources = readRuntimeSources(SOURCES);
// The source test configuration (tooling/configs/runtime-flags.ts).
const testDefines = {
  __DEV__: "false",
  __PROFILE__: "false",
  __TRACKING_ONE_HOP__: "true",
  __TRACKING_TWO_HOP__: "true",
  __TRACKING_LAST_EDGE__: "true",
};
const table = collectConstants(sources, testDefines);

describe("build-time constant inlining", () => {
  it("evaluates every exported constant to the value the module exports", async () => {
    const checkedNames = new Set<string>();
    for (const file of sources) {
      if (!/export const /.test(file.code)) continue;
      const module = (await import(pathToFileURL(file.path).href)) as Record<
        string,
        unknown
      >;
      for (const [name, value] of Object.entries(module))
        if (table.has(name)) {
          expect(value, `${path.relative(SOURCES, file.path)}: ${name}`).toBe(
            table.get(name),
          );
          checkedNames.add(name);
        }
    }
    expect([...checkedNames]).toEqual(expect.arrayContaining(STATE_FLAG_NAMES));
    // Exercise non-state constants without depending on a historical export count.
    expect(checkedNames.size).toBeGreaterThan(STATE_FLAG_NAMES.length);
  });

  it("covers every node state flag", () => {
    for (const name of STATE_FLAG_NAMES)
      expect(table.has(name), name).toBe(true);
  });

  it("follows the compile-time defines of the build", () => {
    const dev = collectConstants(sources, { ...testDefines, __DEV__: "true" });
    expect(table.get("Consumer")).toBe(0);
    expect(dev.get("Consumer")).not.toBe(0);
    expect(dev.get("WATCHER_INITIAL_STATE")).not.toBe(
      table.get("WATCHER_INITIAL_STATE"),
    );
  });

  it("excludes a name declared with different values in two modules", () => {
    const ambiguous = collectConstants(
      [
        ...sources,
        { path: "a.ts", code: "export const Limit = 1;" },
        { path: "b.ts", code: "export const Limit = 2;" },
      ],
      testDefines,
    );
    expect(ambiguous.has("Limit")).toBe(false);
  });

  it("replaces references and keeps declarations, exports and names", () => {
    const source = [
      'import { Visited, Revalidate as R, type Both } from "@runtime/kernel/shape";',
      'import { Visited as Elsewhere } from "some-package";',
      "const MASK = Visited | R;",
      "export { Visited };",
      "type Mask = typeof Visited;",
      "const masks = { Visited, other: node.Visited, [R]: 1 };",
      "class A { Visited = 0; }",
      "export const hot = (s: number) => (s & MASK) !== 0 && ~R && Elsewhere;",
    ].join("\n");
    const local = new Map([...table, ["MASK", 260]]);
    const result = inlineConstants(source, "mod.ts", local)!;
    expect(result.code).toContain(
      "import { Visited, Revalidate as R, type Both }",
    );
    expect(result.code).toContain(
      "const MASK = 4 /* Visited */ | 256 /* R */;",
    );
    expect(result.code).toContain("export { Visited };");
    expect(result.code).toContain("type Mask = typeof Visited;");
    expect(result.code).toContain(
      "{ Visited: 4, other: node.Visited, [256 /* R */]: 1 }",
    );
    expect(result.code).toContain("class A { Visited = 0; }");
    expect(result.code).toContain(
      "(s & 260 /* MASK */) !== 0 && ~256 /* R */ && Elsewhere",
    );
  });

  it("ignores modules that reference no constant", () => {
    expect(inlineConstants("let x = 1; x;", "a.ts", table)).toBeNull();
    expect(
      inlineConstants('import { Visited } from "pkg"; Visited;', "b.ts", table),
    ).toBeNull();
  });

  it("fails the build on a shadowed or written constant", () => {
    const shadow =
      'import { Visited } from "./shape"; function f(Visited: number) { return Visited; }';
    expect(() => inlineConstants(shadow, "c.ts", table)).toThrow(/shadows/);
    const assign = 'import { Changed } from "./shape"; Changed = 3;';
    expect(() => inlineConstants(assign, "d.js", table)).toThrow(/assigns/);
  });
});
