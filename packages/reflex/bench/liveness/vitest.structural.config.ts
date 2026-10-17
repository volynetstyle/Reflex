import { runtimeFlags } from "../../../../tooling/configs/runtime-flags";
import { sourceAliases, configRoot } from "../../../../tooling/configs/source-aliases";
import { defineConfig, type Plugin } from "vitest/config";

// Structural leg of the liveness comparison. Reflex runs from source with
// __PROFILE__ counters; link/unlink counters are injected into the two graph
// files below (exact-count replacements, so a source change fails loudly).

function replaceExactly(code: string, from: string, to: string, count: number, id: string) {
  const parts = code.split(from);
  if (parts.length - 1 !== count) {
    throw new Error(`${id}: expected ${count} x ${JSON.stringify(from)}, found ${parts.length - 1}`);
  }
  return parts.join(to);
}

const header =
  "const __LV: Record<string, number> = ((globalThis as any).__LV_reflex ??= {});\n";

const reflexLinkCounters: Plugin = {
  name: "reflex-liveness-link-counters",
  enforce: "pre",
  transform(raw, id) {
    const file = id.replace(/\\/g, "/");
    const code = raw.replace(/\r\n/g, "\n");
    if (file.endsWith("/reflex-runtime/src/kernel/shape/graph/linkEdge.ts")) {
      let out = replaceExactly(
        code,
        "  const edge: ReactiveEdge = {",
        "  __LV.linkAlloc = (__LV.linkAlloc ?? 0) + 1;\n  const edge: ReactiveEdge = {",
        3,
        file,
      );
      out = replaceExactly(
        out,
        "export function unlinkEdge(edge: ReactiveEdge): void {",
        "export function unlinkEdge(edge: ReactiveEdge): void {\n  __LV.unlink = (__LV.unlink ?? 0) + 1;",
        1,
        file,
      );
      return header + out;
    }
    if (file.endsWith("/reflex-runtime/src/kernel/shape/graph/sweepEdges.ts")) {
      let out = replaceExactly(
        code,
        "  while (edge !== null) {\n    const nextIn = edge.nextIn;",
        "  while (edge !== null) {\n    __LV.unlink = (__LV.unlink ?? 0) + 1;\n    const nextIn = edge.nextIn;",
        1,
        file,
      );
      out = replaceExactly(
        out,
        "  while (edge !== null) {\n    const nextOut = edge.nextOut;",
        "  while (edge !== null) {\n    __LV.unlink = (__LV.unlink ?? 0) + 1;\n    const nextOut = edge.nextOut;",
        1,
        file,
      );
      return header + out;
    }
  },
};

export default defineConfig({
  root: configRoot(import.meta.url),
  plugins: [reflexLinkCounters],
  resolve: {
    alias: sourceAliases("reflex"),
  },
  define: runtimeFlags("profile-test"),
  test: {
    name: "reflex/liveness-structural",
    environment: "node",
    include: ["structural.test.mjs"],
    isolate: false,
    pool: "forks",
    testTimeout: 600_000,
  },
});
