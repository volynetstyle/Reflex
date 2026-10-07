import type { RollupOptions } from "rollup";
import { dts } from "rollup-plugin-dts";

// The runtime stays external so async sources and facade signals share one graph.
const external = (id: string) =>
  id === "@volynets/reflex-runtime" ||
  id.startsWith("@volynets/reflex-runtime/");

export default [
  {
    input: "build/esm/index.js",
    external,
    output: [
      { file: "dist/esm/index.js", format: "es", sourcemap: true },
      { file: "dist/cjs/index.cjs", format: "cjs", sourcemap: true },
    ],
  },
  {
    input: "build/types/index.d.ts",
    external,
    output: {
      file: "dist/index.d.ts",
      format: "es",
      banner:
        '/// <reference lib="dom" />\n/// <reference lib="esnext.disposable" />',
    },
    plugins: [dts()],
  },
] satisfies RollupOptions[];
