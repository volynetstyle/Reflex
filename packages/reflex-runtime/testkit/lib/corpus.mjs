// Counterexample corpus. A divergence found by `diff` or a mutant witness
// found by `mutate` is stored minimized, with the provenance needed to
// reproduce it (family, seed, level, policy, both sides with SHAs). `replay`
// reads these files; test/oracle/oracle.corpus.test.ts replays the committed
// corpus (test/oracle/corpus) on every test run, so a fixed fault stays fixed
// (the regression corpus of coverage-guided fuzzers, Zeller et al., "The
// Fuzzing Book", "Greybox Fuzzing").
//
//   {
//     "schema": "testkit.counterexample", "schemaVersion": 1,
//     "id": "<family>-<seed>-<level>" | "mutant-<id>",
//     "expect": "agree" | "diverge",   what the committed corpus test requires
//     "level": "strict" | "observable",
//     "class"?: <accepted difference class>, "invariants"?: true,
//     "policy": "exact" | "representation" | "baseline",
//     "origin": { command, family?, seed?, mutant?, reference, candidate, foundAt },
//     "size": { original, minimized },
//     "mismatch": { index, baseline, candidate } | null,
//     "program": { spec, ops }
//   }
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { UsageError } from "./args.mjs";

export function counterexampleFile(dir, id) {
  return path.join(dir, `${id}.json`);
}

export function saveCounterexample(dir, entry) {
  mkdirSync(dir, { recursive: true });
  const file = counterexampleFile(dir, entry.id);
  writeFileSync(
    file,
    `${JSON.stringify(
      { schema: "testkit.counterexample", schemaVersion: 1, ...entry },
      null,
      2,
    )}\n`,
  );
  return file;
}

export function readCounterexample(file) {
  if (!existsSync(file)) throw new UsageError(`no counterexample at ${file}`);
  const entry = JSON.parse(readFileSync(file, "utf8"));
  if (entry.schema !== "testkit.counterexample")
    throw new UsageError(`${file} is not a testkit counterexample`);
  return entry;
}

/** Every counterexample under `dir`, recursively, sorted by path. */
export function listCounterexamples(dir) {
  if (!existsSync(dir)) return [];
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith(".json")) found.push(file);
    }
  };
  walk(dir);
  return found.sort();
}
