// Rollup targets of @volynets/reflex-runtime. `npm` is the published build
// (config/rollup/); the others bundle the tsc output (`pnpm build:ts`) with a
// set of compile-time flags for measurements. Select one with
// `rollup -c config/rollup.config.ts --configTarget <target>`.
import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import type { RollupOptions } from "rollup";
import {
  selectRuntimeReplacements,
  type RuntimeFlags,
  type RuntimeMode,
} from "../../../tooling/configs/runtime-flags.ts";
import { createRuntimeRollupConfig } from "./rollup/config.ts";

/** The flags a measurement bundle replaces; the rest stay as compiled. */
const MEASURED_FLAGS = [
  "__DEV__",
  "__PROFILE__",
  "__TRACKING_ONE_HOP__",
  "__TRACKING_TWO_HOP__",
  "__TRACKING_LAST_EDGE__",
] as const;

const INTERNAL = "build/esm/src/internal/index.js";

function measurementBundle(
  input: string,
  file: string,
  flags: RuntimeMode,
  overrides: Partial<RuntimeFlags> = {},
  treeshake: RollupOptions["treeshake"] = { preset: "recommended" },
): RollupOptions {
  return {
    input,
    output: { file, format: "esm", sourcemap: false },
    treeshake,
    plugins: [
      resolve({ extensions: [".js"] }),
      replace({
        preventAssignment: true,
        values: selectRuntimeReplacements(flags, MEASURED_FLAGS, overrides),
      }),
    ],
  };
}

const perfTreeshake = {
  moduleSideEffects: false,
  propertyReadSideEffects: false,
};

export const TARGETS: Record<string, () => RollupOptions[]> = {
  npm: createRuntimeRollupConfig,
  // `pnpm bench:core`, `pnpm perf:tree`: profiling on, every tracking tier.
  perf: () => [
    measurementBundle(
      "build/esm/src/index.js",
      "dist/perf.js",
      "profile-test",
      {},
      perfTreeshake,
    ),
    measurementBundle(
      "perf/perf-tree/run.mjs",
      "dist/perf-tree.js",
      "profile-test",
      {},
      perfTreeshake,
    ),
  ],
  // All 8 on/off combinations of the three tracking tiers.
  "tracking-factorial": () =>
    Array.from({ length: 8 }, (_, bits) => {
      const variant = {
        __TRACKING_ONE_HOP__: (bits & 4) !== 0,
        __TRACKING_TWO_HOP__: (bits & 2) !== 0,
        __TRACKING_LAST_EDGE__: (bits & 1) !== 0,
      };
      const id = `o${Number(variant.__TRACKING_ONE_HOP__)}-t${Number(variant.__TRACKING_TWO_HOP__)}-l${Number(variant.__TRACKING_LAST_EDGE__)}`;
      return measurementBundle(
        INTERNAL,
        `dist/tracking-factorial/${id}.js`,
        "source-test",
        variant,
      );
    }),
  // The last-edge tier on and off, with profiling.
  "tracking-tier-profile": () =>
    [true, false].map((lastEdge) =>
      measurementBundle(
        "perf/tracking-tier-profile.entry.mjs",
        `dist/tracking-tier-profile/${lastEdge ? "last-on" : "last-off"}.js`,
        "profile-test",
        { __TRACKING_LAST_EDGE__: lastEdge },
      ),
    ),
};

export function rollupTarget(name: string): RollupOptions[] {
  const target = TARGETS[name];
  if (target === undefined)
    throw new Error(
      `unknown rollup target "${name}" (known: ${Object.keys(TARGETS).join(", ")})`,
    );
  return target();
}
