import { selectRuntimeReplacements } from "../../../../tooling/configs/runtime-flags.ts";
import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import type { Plugin } from "rollup";
import { createBuildReporter } from "../../../../scripts/rollup-build-reporter.ts";
import type { BuildTarget } from "../types.ts";
import { createTerserPlugin } from "./terser.ts";
import { createInlineStateFlagsPlugin } from "./inline-state-flags.ts";

function pushIfPresent(plugins: Plugin[], plugin: Plugin | null): void {
  if (plugin !== null) plugins.push(plugin);
}

export function createPlugins(target: BuildTarget): Plugin[] {
  const plugins: Plugin[] = [
    createBuildReporter("@volynets/reflex-runtime", target.name),
    resolve({
      extensions: [".js"],
      exportConditions: ["import", "default"],
    }),
    replace({
      preventAssignment: true,
      values: selectRuntimeReplacements(target.mode === "dev" ? "development" : "production", ["__DEV__", "__PROFILE__", "__TRACKING_ONE_HOP__", "__TRACKING_TWO_HOP__", "__TRACKING_LAST_EDGE__"]),
    }),
  ];

  // Production only: dev bundles ship source maps, which this text transform
  // does not maintain, and are not the measured hot path.
  if (target.mode !== "dev") plugins.push(createInlineStateFlagsPlugin());

  pushIfPresent(plugins, createTerserPlugin(target));

  return plugins;
}
