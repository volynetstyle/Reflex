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
  createPerfDomain("tests/perf/runtime-versioned-skip.jit.mjs", "dist/runtime-versioned-skip.jit.js"),
  createPerfDomain("tests/perf/tracking-cleanup-matrix.jit.mjs", "dist/tracking-cleanup-matrix.jit.js"),
  createPerfDomain("tests/perf/tracking-connect.jit.mjs", "dist/tracking-connect.jit.js"),
  createPerfDomain("tests/perf/tracking-lifecycle.jit.mjs", "dist/tracking-lifecycle.jit.js"),
  createPerfDomain("tests/perf/tracking-policies.jit.mjs", "dist/tracking-policies.jit.js"),
  createPerfDomain("tests/perf/walkers.jit.mjs", "dist/walkers.jit.js"),
];
