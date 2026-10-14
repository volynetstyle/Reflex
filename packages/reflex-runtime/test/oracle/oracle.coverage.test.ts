import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadOracleBundle } from "./baseline";
import { generateProgram, interpret, type RuntimeModule } from "./program";

/**
 * Branch coverage of the generated corpus, measured on a PROFILE build of the
 * working tree through the kernel's own projection events. Any branch the
 * committed record lists as covered must stay covered; newly covered branches
 * are reported so the record can be updated deliberately.
 */
const packageRoot = path.resolve(__dirname, "../..");
const RECORD = path.join(__dirname, "branch-coverage.json");
const SEEDS = Number(process.env.ORACLE_COVERAGE_SEEDS ?? 3_000);

function sourceEvents(directory: string, found = new Set<string>()) {
  for (const entry of readdirSync(directory)) {
    const file = path.join(directory, entry);
    if (statSync(file).isDirectory()) sourceEvents(file, found);
    else if (file.endsWith(".ts")) {
      for (const match of readFileSync(file, "utf8").matchAll(
        /"(projection\.semantic\.[a-z0-9.-]+)"/g,
      ))
        found.add(match[1]!);
    }
  }
  return found;
}

describe("oracle corpus branch coverage", () => {
  it("does not lose previously covered kernel branches", async () => {
    const runtime = (await loadOracleBundle(
      ["--source", "--profile"],
      "coverage-source",
    )) as RuntimeModule & {
      setRuntimeProjectionObserver(
        fn: ((o: { id: string }) => void) | undefined,
      ): void;
    };
    const hits = new Map<string, number>();
    runtime.setRuntimeProjectionObserver((observation) =>
      hits.set(observation.id, (hits.get(observation.id) ?? 0) + 1),
    );
    for (let seed = 1; seed <= SEEDS; seed++) {
      interpret(runtime, generateProgram(seed));
    }
    runtime.setRuntimeProjectionObserver(undefined);

    const universe = [...sourceEvents(path.join(packageRoot, "src"))].sort();
    const covered = universe.filter((id) => hits.has(id));
    const uncovered = universe.filter((id) => !hits.has(id));
    const report = {
      seeds: SEEDS,
      universe: universe.length,
      covered: covered.length,
      uncovered,
      hits: Object.fromEntries([...hits].sort()),
    };
    writeFileSync(
      path.join(packageRoot, ".cache/oracle/branch-coverage.report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );

    if (process.env.ORACLE_COVERAGE_RECORD === "1") {
      writeFileSync(RECORD, `${JSON.stringify({ covered }, null, 2)}\n`);
    }
    const record = JSON.parse(readFileSync(RECORD, "utf8")) as {
      covered: string[];
    };
    const lost = record.covered.filter((id) => !hits.has(id));
    expect(lost, "branches the corpus no longer reaches").toEqual([]);
  }, 600_000);
});
