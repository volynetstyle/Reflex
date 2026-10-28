import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { inventory } from "../lib/inventory.mjs";
import {
  packageRoot,
  pinnedBaseline,
  repoRoot,
  sidesDir,
} from "../lib/paths.mjs";

export const synopsis = "[options]";
export const description = [
  "Checks the environment (Node, TypeScript stripping, git, the pinned",
  "baseline) and the catalog inventory: every test file owned by exactly one",
  "suite and run by a config that includes it, every budget read by a test,",
  "every owner document present, every gate naming known suites, the",
  "committed corpus well formed. Exits 1 on an error.",
].join("\n");

export const options = {
  quiet: { type: "boolean", describe: "print errors only" },
};

const CI_NODE_MAJOR = 24; // .github/workflows: node-version

export default async function doctorCommand(values) {
  const lines = [];
  const say = (mark, text) => lines.push(`${mark} ${text}`);
  let errors = 0;

  const major = Number(process.versions.node.split(".")[0]);
  say(
    process.features?.typescript ? "✓" : "✗",
    `Node ${process.version}, TypeScript stripping: ${process.features?.typescript || "unavailable"}`,
  );
  if (!process.features?.typescript) errors++;
  if (major !== CI_NODE_MAJOR)
    say(
      "!",
      `CI runs Node ${CI_NODE_MAJOR}; shape and timing results from Node ${major} do not transfer (docs/PERFORMANCE_RULES.md)`,
    );

  const baseline = pinnedBaseline();
  try {
    execFileSync("git", ["cat-file", "-e", `${baseline}^{commit}`], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    say("✓", `pinned baseline ${baseline.slice(0, 12)} is present`);
  } catch {
    say(
      "!",
      `pinned baseline ${baseline.slice(0, 12)} is missing; the oracle builder will fetch it`,
    );
  }
  const cached = existsSync(sidesDir) ? readdirSync(sidesDir).length : 0;
  say(
    "·",
    `${cached} cached side builds in ${path.relative(packageRoot, sidesDir).replaceAll("\\", "/")}`,
  );

  try {
    const { families } = await import(
      pathToFileURL(path.join(packageRoot, "test/oracle/families.ts")).href
    );
    const first = families.default.generate(1);
    say("✓", `oracle modules load (default seed 1: ${first.ops.length} ops)`);
  } catch (error) {
    say("✗", `oracle modules do not load: ${error.message}`);
    errors++;
  }

  const found = inventory();
  say(
    found.errors.length === 0 ? "✓" : "✗",
    `inventory: ${found.testFiles} test files, ${found.errors.length} errors, ${found.warnings.length} warnings`,
  );
  for (const error of found.errors) say("  ✗", error);
  for (const warning of found.warnings) say("  !", warning);
  if (!values.quiet) for (const note of found.notes) say("  ·", note);
  errors += found.errors.length;

  for (const line of lines)
    if (!values.quiet || line.includes("✗")) console.log(line);
  return errors === 0 ? 0 : 1;
}
