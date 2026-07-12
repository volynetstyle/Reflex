import replace from "@rollup/plugin-replace";
import resolve from "@rollup/plugin-node-resolve";

const createPerfDomain = (input: string, file: string) => ({
  input,
  output: {
    file,
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
        __PROFILE__: "true",
        __TRACKING_ONE_HOP__: "true",
        __TRACKING_TWO_HOP__: "true",
        __TRACKING_LAST_EDGE__: "true",
      },
    }),
  ],
});

export default [
  createPerfDomain("build/esm/index.js", "dist/perf.js"),
  createPerfDomain("perf-tree/run.mjs", "dist/perf-tree.js"),
];
