import replace from "@rollup/plugin-replace";
import resolve from "@rollup/plugin-node-resolve";

export default {
  input: "build/esm/index.js",
  output: {
    file: "dist/perf.js",
    format: "esm",

    sourcemap: false,
  },
  treeshake: {
    moduleSideEffects: false,
    propertyReadSideEffects: false,
  },
  plugins: [
    resolve({
      extensions: [".js"],
    }),
    replace({
      preventAssignment: true,
      values: {
        __DEV__: "false",
      },
    }),
  ],
};
