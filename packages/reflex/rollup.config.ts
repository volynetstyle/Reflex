import type { RollupOptions } from "rollup";
import resolve from "@rollup/plugin-node-resolve";

function createConfig(input: string, output: string): RollupOptions {
  return {
    input,
    output: {
      file: output,
      format: "esm",
      sourcemap: true,
      inlineDynamicImports: true,
    },
    plugins: [
      resolve({
        exportConditions: ["import", "default"],
        extensions: [".js"],
      }),
    ],
    treeshake: {
      moduleSideEffects: false,
      propertyReadSideEffects: false,
      tryCatchDeoptimization: false,
      unknownGlobalSideEffects: false,
    },
  };
}

export default [
  createConfig("build/esm/index.js", "dist/index.js"),
  createConfig("build/esm/setup.js", "dist/setup.js"),
];
