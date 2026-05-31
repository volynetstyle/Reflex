import type { OutputOptions } from "rollup";
import { GENERATED_CODE_OPTIONS } from "./optimization.ts";
import type { BuildTarget } from "./types.ts";

export function createOutput(target: BuildTarget): OutputOptions {
  return {
    dir: `dist/${target.outDir}`,
    format: target.format,
    entryFileNames: target.format === "cjs" ? "[name].cjs" : "[name].js",
    chunkFileNames: target.format === "cjs" ? "[name].cjs" : "[name].js",
    exports: target.format === "cjs" ? "named" : undefined,
    sourcemap: target.mode === "dev",
    generatedCode: GENERATED_CODE_OPTIONS,
    interop: "compat",
  };
}
