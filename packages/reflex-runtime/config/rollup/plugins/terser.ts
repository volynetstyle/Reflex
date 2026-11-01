import terser from "@rollup/plugin-terser";
import type { Plugin } from "rollup";
import { createRuntimeTerserOptions } from "../terser-options.ts";
import { isProd } from "../targets.ts";
import type { BuildTarget } from "../types.ts";

export function createTerserPlugin(target: BuildTarget): Plugin | null {
  if (!isProd(target)) return null;

  return terser(createRuntimeTerserOptions(target.format === "esm"));
}
