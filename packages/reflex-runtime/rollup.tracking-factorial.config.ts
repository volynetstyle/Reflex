import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import type { RollupOptions } from "rollup";

type Variant = {
  oneHop: boolean;
  twoHop: boolean;
  lastEdge: boolean;
};

function idOf(variant: Variant): string {
  return `o${Number(variant.oneHop)}-t${Number(variant.twoHop)}-l${Number(variant.lastEdge)}`;
}

function createVariant(variant: Variant): RollupOptions {
  return {
    input: "build/esm/internal/index.js",
    output: {
      file: `dist/tracking-factorial/${idOf(variant)}.js`,
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
          __PROFILE__: "false",
          __TRACKING_ONE_HOP__: JSON.stringify(variant.oneHop),
          __TRACKING_TWO_HOP__: JSON.stringify(variant.twoHop),
          __TRACKING_LAST_EDGE__: JSON.stringify(variant.lastEdge),
        },
      }),
    ],
  };
}

export default Array.from({ length: 8 }, (_, bits) =>
  createVariant({
    oneHop: (bits & 4) !== 0,
    twoHop: (bits & 2) !== 0,
    lastEdge: (bits & 1) !== 0,
  }),
);
