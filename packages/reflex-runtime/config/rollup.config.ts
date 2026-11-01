import type { RollupOptions } from "rollup";
import { rollupTarget } from "./rollup.ts";

export default (args: { configTarget?: string }): RollupOptions[] =>
  rollupTarget(args.configTarget ?? "npm");
