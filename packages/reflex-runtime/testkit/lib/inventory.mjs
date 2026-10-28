// Catalog inventory: the checks that keep the registry true to the tree.
// A test file no suite owns is never run by `pnpm rt run`; a budget variable
// no test reads is a budget that silently does nothing; an owner document
// that does not exist is a broken citation. Used by `doctor` and by the
// self-test, so CI fails on drift.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { listCounterexamples } from "./corpus.mjs";
import {
  committedCorpusDir,
  packageRelative,
  packageRoot,
  repoRoot,
} from "./paths.mjs";
import { GATES, SUITES } from "../registry.mjs";

const TEST_FILE = /\.(test\.ts|test\.mjs|e2e\.mjs)$/;
const DISABLED = /\.(no_test|skip)\.[cm]?[jt]s$/;

function walk(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file, found);
    else found.push(packageRelative(file));
  }
  return found;
}

// Which vitest config may own which files (the configs' include/exclude).
const CONFIG_SCOPE = {
  source: (file) =>
    !file.startsWith("test/dev/") &&
    !file.startsWith("test/projection/") &&
    !file.startsWith("test/characterization/"),
  dev: (file) => file.startsWith("test/dev/") && file.endsWith(".dev.test.ts"),
  projection: (file) => file.startsWith("test/projection/"),
  characterization: (file) => file.startsWith("test/characterization/"),
};

/** Returns { errors, warnings, notes }: strings, one finding each. */
export function inventory() {
  const errors = [];
  const warnings = [];
  const notes = [];

  const ids = new Set();
  for (const item of SUITES) {
    if (ids.has(item.id)) errors.push(`suite id ${item.id} is not unique`);
    ids.add(item.id);
    if (!item.id.startsWith(`${item.layer}.`))
      errors.push(
        `suite ${item.id} is not named after its layer ${item.layer}`,
      );
  }

  const files = walk(path.join(packageRoot, "test"));
  const tests = files.filter((file) => TEST_FILE.test(file));
  for (const file of files.filter((file) => DISABLED.test(file)))
    notes.push(`${file} is disabled by its name and runs nowhere`);

  const owners = new Map(tests.map((file) => [file, []]));
  for (const item of SUITES) {
    for (const pattern of item.files ?? []) {
      const matched = tests.filter((file) => file.startsWith(pattern));
      if (matched.length === 0)
        errors.push(
          `suite ${item.id} owns ${pattern}, which matches no test file`,
        );
      for (const file of matched) {
        owners.get(file).push(item.id);
        const scope =
          item.runner.type === "vitest" && item.runner.cwd === undefined
            ? CONFIG_SCOPE[item.runner.profile]
            : undefined;
        if (scope !== undefined && !scope(file))
          errors.push(
            `suite ${item.id} runs ${file} with profile ${item.runner.profile}, which does not include it`,
          );
      }
    }
  }
  for (const [file, list] of owners) {
    if (list.length === 0)
      errors.push(`${file} is owned by no suite (testkit/registry.mjs)`);
    if (list.length > 1)
      errors.push(`${file} is owned by ${list.join(" and ")}`);
  }

  for (const item of SUITES) {
    const owner = item.owner.split("#")[0];
    if (
      !existsSync(path.resolve(packageRoot, owner)) &&
      !existsSync(path.resolve(repoRoot, owner))
    )
      errors.push(
        `suite ${item.id} names owner ${item.owner}, which does not exist`,
      );
    for (const [tier, env] of Object.entries(item.budgets ?? {})) {
      if (!item.tiers.includes(tier))
        warnings.push(
          `suite ${item.id} has a ${tier} budget but the ${tier} tier does not run it`,
        );
      const sources = (item.files ?? [])
        .flatMap((pattern) => tests.filter((file) => file.startsWith(pattern)))
        .map((file) => readFileSync(path.join(packageRoot, file), "utf8"))
        .join("\n");
      for (const key of Object.keys(env))
        if (!sources.includes(`process.env.${key}`))
          errors.push(
            `suite ${item.id} budgets ${key}, which none of its files reads`,
          );
    }
    if (
      item.tiers.length === 0 &&
      !Object.values(GATES).some((gate) => gate.suites.includes(item.id))
    )
      notes.push(
        `suite ${item.id} is in no tier and no gate: it runs only when named`,
      );
  }
  for (const [name, gate] of Object.entries(GATES))
    for (const id of gate.suites)
      if (!ids.has(id)) errors.push(`gate ${name} names unknown suite ${id}`);

  for (const file of listCounterexamples(committedCorpusDir)) {
    try {
      const entry = JSON.parse(readFileSync(file, "utf8"));
      if (entry.schema !== "testkit.counterexample")
        errors.push(`${packageRelative(file)} is not a testkit counterexample`);
      else if (`${entry.id}.json` !== path.basename(file))
        errors.push(`${packageRelative(file)} has id ${entry.id}`);
      else if (entry.expect !== "agree" && entry.expect !== "diverge")
        errors.push(`${packageRelative(file)} expects "${entry.expect}"`);
    } catch (error) {
      errors.push(`${packageRelative(file)} does not parse: ${error.message}`);
    }
  }
  return { errors, warnings, notes, testFiles: tests.length };
}
