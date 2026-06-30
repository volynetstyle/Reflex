import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import constEnum from "rollup-plugin-const-enum";
import type { Plugin } from "rollup";
import { createBuildReporter } from "../../../../scripts/rollup-build-reporter.ts";
import { isProd } from "../targets.ts";
import type { BuildTarget } from "../types.ts";
import { safeInlineIIFEPlugin } from "./safeInlineIIFE.ts";
import { createSwcPlugin } from "./swc.ts";
import { createTerserPlugin } from "./terser.ts";
import { validateFinalChunkPlugin } from "./validateFinalChunk.ts";

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
    constEnum(),
  ];

  pushIfPresent(plugins, createSwcPlugin(target));

  if (isProd(target)) plugins.push(safeInlineIIFEPlugin());

  pushIfPresent(plugins, createTerserPlugin(target));
  plugins.push(validateFinalChunkPlugin());

  return plugins;
}
