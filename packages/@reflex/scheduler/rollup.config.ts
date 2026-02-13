import type { RollupOptions, ModuleFormat } from "rollup";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import resolve from "@rollup/plugin-node-resolve";

interface BuildConfig {
  outDir: string;
  dev: boolean;
  format: ModuleFormat;
}

const build = (cfg: BuildConfig) => {
  const { outDir, dev, format } = cfg;

  return {
    input: "build/esm/index.js",
    treeshake: {
      moduleSideEffects: false,
      propertyReadSideEffects: false,
      tryCatchDeoptimization: false,
    },
    output: {
      dir: `dist/${outDir}`,
      format,
      preserveModules: true,
      preserveModulesRoot: "build/esm",
      exports: format === "cjs" ? "named" : undefined,
      sourcemap: dev,
    },
    plugins: [
      resolve({
        extensions: [".js"],
        exportConditions: ["import", "default"],
      }),
      replace({
        preventAssignment: true,
        values: {
          __DEV__: JSON.stringify(dev),
        },
      }),
      !dev &&
        terser({
          compress: {
            dead_code: true,
            conditionals: true,
            booleans: true,
            unused: true,
            if_return: true,
            sequences: true,
          },
          mangle: {
            keep_classnames: true,
            keep_fnames: true,
            properties: { regex: /^_/ },
          },
          format: {
            comments: false,
          },
        }),
    ],
  } satisfies RollupOptions;
};

export default [
  build({ outDir: "esm", dev: false, format: "esm" }),
  build({ outDir: "dev", dev: true, format: "esm" }),
  build({ outDir: "cjs", dev: false, format: "cjs" }),
] satisfies RollupOptions[];
