// Locations the testkit reads and writes. Everything the testkit produces
// lives under .cache/testkit (ignored by git) unless a command is told to
// write into the repository, as `mutate --witnesses test/oracle/corpus`.
import { readFileSync } from "node:fs";
import path from "node:path";

export const packageRoot = path.resolve(import.meta.dirname, "../..");
export const repoRoot = path.resolve(packageRoot, "../..");
export const cacheRoot = path.join(packageRoot, ".cache/testkit");
export const reportsDir = path.join(cacheRoot, "reports");
export const sidesDir = path.join(cacheRoot, "sides");
export const scratchCorpusDir = path.join(cacheRoot, "corpus");
export const committedCorpusDir = path.join(packageRoot, "test/oracle/corpus");
export const oracleBuilder = path.join(
  packageRoot,
  "scripts/build-baseline-oracle.mjs",
);

/** The frozen baseline of the program oracle (test/oracle/baseline-commit.txt). */
export function pinnedBaseline() {
  return readFileSync(
    path.join(packageRoot, "test/oracle/baseline-commit.txt"),
    "utf8",
  ).trim();
}

/** A path relative to the package root, with forward slashes. */
export function packageRelative(file) {
  return path.relative(packageRoot, file).replaceAll("\\", "/");
}
