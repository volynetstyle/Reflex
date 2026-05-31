import type { OutputOptions, RollupOptions } from "rollup";

export type BuildFormat = "esm" | "cjs";
export type BuildMode = "prod" | "dev";

export interface BuildTarget {
  readonly input: Record<string, string>;
  readonly name: string;
  readonly outDir: string;
  readonly format: BuildFormat;
  readonly mode: BuildMode;
}

export type RollupTreeshakeOptions = RollupOptions["treeshake"];
export type GeneratedCodeOptions = NonNullable<OutputOptions["generatedCode"]>;
