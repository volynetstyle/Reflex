// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../src");
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? files(path)
      : path.endsWith(".ts")
        ? [path]
        : [];
  });
}

describe("renderer dependency boundaries", () => {
  it("keeps root policy, mounting, lifetime and host primitives in their layers", () => {
    const allowed: Record<string, string[]> = {
      runtime: ["runtime", "types"],
      structure: ["structure", "host", "renderable"],
      host: ["host", "types"],
      reconcile: ["reconcile"],
      server: ["server", "types", "operators", "renderable", "host"],
    };
    const violations: string[] = [];
    for (const file of files(root)) {
      const from = relative(root, file).replaceAll("\\", "/");
      const layer = from.split("/")[0]!;
      if (!(layer in allowed)) continue;
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\bfrom\s+["'](\.[^"']+)["']/g)) {
        const to = relative(root, resolve(dirname(file), match[1]!)).replaceAll(
          "\\",
          "/",
        );
        if (!allowed[layer]!.includes(to.split("/")[0]!))
          violations.push(`${from} -> ${to}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
