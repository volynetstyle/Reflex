import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { RuntimeModule } from "./program";

const packageRoot = path.resolve(__dirname, "../..");

export const BASELINE_COMMIT = readFileSync(
  path.join(packageRoot, "test/oracle/baseline-commit.txt"),
  "utf8",
).trim();

/** Builds (once) and loads a frozen runtime bundle. */
export async function loadOracleBundle(
  extraArgs: string[] = [],
  label = BASELINE_COMMIT.slice(0, 12),
): Promise<RuntimeModule> {
  const bundle = path.join(packageRoot, ".cache/oracle", label, "runtime.mjs");
  // Working-tree bundles (mutants, coverage) are rebuilt every run so they
  // never go stale; commit bundles are immutable and cached.
  if (extraArgs.includes("--source") || !existsSync(bundle)) {
    execFileSync(
      process.execPath,
      [
        "scripts/build-baseline-oracle.mjs",
        "--out",
        path.dirname(bundle),
        ...extraArgs,
      ],
      { cwd: packageRoot, stdio: "pipe" },
    );
  }
  const url = pathToFileURL(bundle).href + `?t=${Date.now()}`;
  return (await import(url)) as RuntimeModule;
}

export function loadBaseline(): Promise<RuntimeModule> {
  return loadOracleBundle();
}
