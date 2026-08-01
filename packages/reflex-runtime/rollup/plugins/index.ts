import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import type { Plugin } from "rollup";
import { createBuildReporter } from "../../../../scripts/rollup-build-reporter.ts";
import type { BuildTarget } from "../types.ts";
import { createTerserPlugin } from "./terser.ts";

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
      values: {
        __DEV__: JSON.stringify(target.mode === "dev"),
        __PROFILE__: JSON.stringify(target.mode === "dev"),
        __TRACKING_ONE_HOP__: "true",
        __TRACKING_TWO_HOP__: "true",
        __TRACKING_LAST_EDGE__: "true",
      },
    }),
  ];

  pushIfPresent(plugins, createTerserPlugin(target));

  return plugins;
}
