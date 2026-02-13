import type { RollupOptions, ModuleFormat } from "rollup";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import resolve from "@rollup/plugin-node-resolve";

interface BuildConfig {
  outDir: string;
  dev: boolean;
  format: ModuleFormat;
}

const resolvers = resolve({
  extensions: [".js"],
  exportConditions: ["import", "default"],
});

const replacers = (dev: boolean) =>
  replace({
    preventAssignment: true,
    values: {
      __DEV__: JSON.stringify(dev),
    },
  });

const testers = (dev: boolean) =>
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
      toplevel: true,
      keep_fnames: false,
      keep_classnames: true,
    },
    format: {
      comments: false,
    },
  });

function build({ outDir, dev, format }: BuildConfig) {
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
    plugins: [resolvers, replacers(dev), testers(dev)],
  } satisfies RollupOptions;
}

export default [
  build({ outDir: "esm", dev: false, format: "esm" }),
  build({ outDir: "dev", dev: true, format: "esm" }),
  build({ outDir: "cjs", dev: false, format: "cjs" }),
];
