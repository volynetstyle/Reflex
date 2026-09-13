import fs from "node:fs";
import { fileURLToPath } from "node:url";
import base from "../../vite.config";
const rotation = fs.readFileSync(
  new URL("./rotation-body.ts.txt", import.meta.url),
  "utf8",
);
export default {
  ...base,
  root: fileURLToPath(new URL("../../", import.meta.url)),
  plugins: [
    ...(base.plugins ?? []),
    {
      name: "bounded-rotation-experiment",
      enforce: "pre" as const,
      transform(code: string, id: string) {
        const normalized = id.replaceAll("\\", "/");
        if (
          normalized.endsWith(
            "/test/runtime/topology/runtime.tracking-resolver.test.ts",
          )
        ) {
          // The sole existing assertion of the old unvisited-suffix order.
          // Keep the original test untouched; this overlay asserts rotation order.
          const oldOrder =
            "      movedEdge!,\n      expectedEdge!,\n      lookaheadEdge!,\n      lastEdge!,";
          const newOrder =
            "      movedEdge!,\n      lastEdge!,\n      expectedEdge!,\n      lookaheadEdge!,";
          const normalizedCode = code.replaceAll("\r\n", "\n");
          if (normalizedCode.split(oldOrder).length !== 2)
            throw new Error("Policy assertion not found exactly once");
          return normalizedCode.replace(oldOrder, newOrder);
        }
        if (!normalized.endsWith("/src/kernel/shape/graph/edgeList.ts")) return;
        const pattern =
          /(export function moveTrackedIncomingEdgeAfterCursorUnchecked\([\s\S]*?\): true \{)[\s\S]*?\n\}/;
        if (!pattern.test(code)) throw new Error("Rotation helper not found");
        return code.replace(
          pattern,
          (_match, signature) => signature + "\n" + rotation + "}",
        );
      },
    },
  ],
};
