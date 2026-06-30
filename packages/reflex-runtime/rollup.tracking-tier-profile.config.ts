import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import type { RollupOptions } from "rollup";

function createVariant(lastEdge: boolean): RollupOptions {
  const id = lastEdge ? "last-on" : "last-off";
  return {
    input: "perf/tracking-tier-profile.entry.mjs",
    output: {
      file: `dist/tracking-tier-profile/${id}.js`,
      format: "esm",
      sourcemap: false,
    },
    treeshake: { preset: "recommended" },
    plugins: [
      resolve({ extensions: [".js"] }),
      replace({
        preventAssignment: true,
        values: {
          __DEV__: "false",
          __PROFILE__: "true",
          __TRACKING_ONE_HOP__: "true",
          __TRACKING_TWO_HOP__: "true",
          __TRACKING_LAST_EDGE__: JSON.stringify(lastEdge),
        },
      }),
    ],
  };
}

export default [createVariant(true), createVariant(false)];
