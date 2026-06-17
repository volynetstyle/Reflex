import type { RollupOptions } from "rollup";
import { reportRollupWarning } from "../../../scripts/rollup-build-reporter.ts";
import { SAFE_TREESHAKE_OPTIONS } from "./optimization.ts";
import { createOutput } from "./output.ts";
import { createPlugins } from "./plugins/index.ts";
import { EXTERNALS, TARGETS } from "./targets.ts";
import type { BuildTarget } from "./types.ts";

export function createConfig(target: BuildTarget): RollupOptions {
  return {
    input: target.input,
    logLevel: "silent",
    onwarn: reportRollupWarning,
    output: createOutput(target),
    treeshake: SAFE_TREESHAKE_OPTIONS,
    plugins: createPlugins(target),
    external: [...EXTERNALS],
  };
}

function splitTargetInputs(target: BuildTarget): BuildTarget[] {
  return Object.entries(target.input).map(([entryName, input]) => ({
    ...target,
    input: { [entryName]: input },
    name: `${target.name}:${entryName}`,
  }));
}

export function createRuntimeRollupConfig(): RollupOptions[] {
  return TARGETS.flatMap(splitTargetInputs).map(createConfig);
}
