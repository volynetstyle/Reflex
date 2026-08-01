import type { BuildTarget } from "./types.ts";

export const INDEX_AND_INTERNAL_INPUT = {
  index: "build/esm/src/index.js",
  internal: "build/esm/src/internal/index.js",
} as const;

export const INDEX_AND_DEBUG_INPUT = {
  index: "build/esm/src/index.js",
  internal: "build/esm/src/internal/index.js",
  debug: "build/esm/debug/index.js",
} as const;

export const EXTERNALS = [
  "vitest",
  "expect-type",
] as const;

export const TARGETS: readonly BuildTarget[] = [
  {
    input: INDEX_AND_INTERNAL_INPUT,
    name: "esm",
    outDir: "esm",
    format: "esm",
    mode: "prod",
  },
  {
    input: INDEX_AND_DEBUG_INPUT,
    name: "esm-dev",
    outDir: "dev",
    format: "esm",
    mode: "dev",
  },
  {
    input: INDEX_AND_INTERNAL_INPUT,
    name: "cjs",
    outDir: "cjs",
    format: "cjs",
    mode: "prod",
  },
] as const;

export function isProd(target: BuildTarget): boolean {
  return target.mode === "prod";
}
