import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as meta from "../../../src/kernel/shape/meta";
import {
  STATE_FLAG_NAMES,
  inlineStateFlags,
  readStateFlags,
} from "../../../rollup/inline-state-flags";

const META = path.resolve(__dirname, "../../../src/kernel/shape/meta.ts");
const flags = readStateFlags(readFileSync(META, "utf8"));

describe("build-time state flag inlining", () => {
  it("evaluates every flag to the value the runtime exports", () => {
    for (const name of STATE_FLAG_NAMES)
      expect(flags.get(name), name).toBe(
        (meta as Record<string, unknown>)[name],
      );
  });

  it("replaces references and keeps declarations, exports and names", () => {
    const source = [
      'import { Visited, Revalidate as R, type Both } from "@runtime/kernel/shape";',
      "export { Visited };",
      "type Mask = typeof Visited;",
      "const masks = { Visited, other: node.Visited, [R]: 1 };",
      "class A { Visited = 0; }",
      "export const hot = (s: number) => (s & (Visited | R)) !== 0 && ~R;",
    ].join("\n");
    const result = inlineStateFlags(source, "mod.ts", flags)!;
    expect(result.code).toContain('import { Visited, Revalidate as R, type Both }');
    expect(result.code).toContain("export { Visited };");
    expect(result.code).toContain("type Mask = typeof Visited;");
    expect(result.code).toContain("{ Visited: 4, other");
    expect(result.code).toContain("node.Visited");
    expect(result.code).toContain("[256 /* R */]: 1");
    expect(result.code).toContain("class A { Visited = 0; }");
    expect(result.code).toContain(
      "(s & (4 /* Visited */ | 256 /* R */)) !== 0 && ~256 /* R */",
    );
    expect(result.replaced).toBe(5);
  });

  it("ignores modules that import no flag or import from elsewhere", () => {
    expect(inlineStateFlags("const Visited = 1;", "a.ts", flags)).toBeNull();
    expect(
      inlineStateFlags('import { Visited } from "./other"; Visited;', "b.ts", flags),
    ).toBeNull();
  });

  it("fails the build on a shadowed or reassigned flag", () => {
    const shadow =
      'import { Visited } from "./shape"; function f(Visited: number) { return Visited; }';
    expect(() => inlineStateFlags(shadow, "c.ts", flags)).toThrow(/shadows/);
    const assign = 'import { Changed } from "./shape"; Changed = 3;';
    expect(() => inlineStateFlags(assign, "d.js", flags)).toThrow(/assigns/);
  });

  it("fails on a flag initializer it cannot evaluate", () => {
    expect(() =>
      readStateFlags(
        "export const Unknown = 1; export const Changed = 2; export const Both = Unknown | Changed; export const Visited = compute(); export const Computing = 8;",
      ),
    ).toThrow(/cannot evaluate/);
  });
});
