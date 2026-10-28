import { UsageError } from "../lib/args.mjs";
import { execute, plan, summarize } from "../lib/executor.mjs";
import { printReportPath, writeReport } from "../lib/report.mjs";
import { select, TIERS } from "../registry.mjs";

export const synopsis = "[suite | layer | prefix ...] [options]";
export const description = [
  "Runs suites of the catalog (pnpm rt list). Without selectors, runs every",
  "suite of the tier. A selector is a suite id (oracle.differential), a layer",
  "(oracle) or an id prefix (spec.); an explicit suite id runs even when its",
  "tier does not include it. The tier also sets the suites' budgets.",
].join("\n");

export const options = {
  tier: {
    type: "string",
    default: "ci",
    describe: `budget tier: ${Object.keys(TIERS).join(" | ")}`,
  },
  "keep-going": {
    type: "boolean",
    describe: "run every step even after a failure",
  },
  "dry-run": {
    type: "boolean",
    describe: "print the processes without running them",
  },
  report: {
    type: "string",
    placeholder: "file",
    describe: "write the run record here",
  },
};

export default async function runCommand(values, selectors) {
  if (!(values.tier in TIERS))
    throw new UsageError(
      `unknown tier "${values.tier}" (known: ${Object.keys(TIERS).join(", ")})`,
    );
  let suites;
  try {
    suites = select(selectors, values.tier);
  } catch (error) {
    throw new UsageError(error.message);
  }
  const steps = await plan(suites, values.tier);
  console.log(
    `tier ${values.tier}: ${suites.length} suites in ${steps.length} processes`,
  );
  const began = performance.now();
  const outcome = await execute(steps, {
    keepGoing: values["keep-going"],
    dryRun: values["dry-run"],
  });
  if (values["dry-run"]) return 0;
  console.log(`\n${summarize(outcome)}`);
  printReportPath(
    writeReport(
      "run",
      {
        tier: values.tier,
        selectors,
        status: outcome.status,
        durationMs: Math.round(performance.now() - began),
        steps: outcome.steps,
      },
      values.report,
    ),
  );
  return outcome.status === "passed" ? 0 : 1;
}
