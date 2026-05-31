import swc from "@rollup/plugin-swc";
import type { Plugin } from "rollup";
import { isProd } from "../targets.ts";
import type { BuildTarget } from "../types.ts";

export function createSwcPlugin(target: BuildTarget): Plugin | null {
  if (!isProd(target)) return null;

  return swc({
    swc: {
      jsc: {
        target: "es2022",
        parser: { syntax: "ecmascript" },
      },
      module: { type: "es6" },
    },
  });
}
