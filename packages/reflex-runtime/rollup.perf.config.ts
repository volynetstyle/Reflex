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
      },
    }),
  ],
});

export default [
  createPerfDomain("build/esm/index.js", "dist/perf.js"),
  createPerfDomain("tests/perf/walkers.jit.mjs", "dist/walkers.jit.js"),
];
