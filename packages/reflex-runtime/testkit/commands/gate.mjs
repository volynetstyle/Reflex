import { UsageError } from "../lib/args.mjs";
import { execute, plan, summarize } from "../lib/executor.mjs";
import { printReportPath, writeReport } from "../lib/report.mjs";
import { GATES, select, suite } from "../registry.mjs";

export const synopsis =
  "<docs | refactor | semantic | hot-path | build | bench-harness> [options]";
export const description = [
  "Runs the checks a change of one kind must pass before commit, as the",
  "table 'Checks by change kind' of docs/GUIDE.md states them. Steps that",
  "cannot run locally (paired CI timing, contract updates) are printed as",
  "obligations; a passing gate does not discharge them.",
  "",
  ...Object.entries(GATES).map(
    ([name, gate]) => `  ${name.padEnd(14)}${gate.summary}`,
  ),
].join("\n");

export const options = {
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

export default async function gateCommand(values, [name, ...extra]) {
  const gate = GATES[name];
  if (gate === undefined || extra.length > 0)
    throw new UsageError(`expected one gate: ${Object.keys(GATES).join(", ")}`);
  const tier = gate.tier ?? "ci";
  const suites = [
    ...(gate.tier ? select([], gate.tier) : []),
    ...gate.suites.map((id) => {
      const found = suite(id);
      if (found === undefined)
        throw new Error(`gate ${name} names unknown suite ${id}`);
      return found;
    }),
  ];
  const began = performance.now();
  const outcome = await execute(await plan(suites, tier), {
    keepGoing: values["keep-going"],
    dryRun: values["dry-run"],
  });
  if (gate.manual.length > 0) {
    console.log("\nobligations this gate cannot discharge:");
    for (const line of gate.manual) console.log(`  - ${line}`);
  }
  if (values["dry-run"]) return 0;
  console.log(`\ngate ${name}: ${outcome.status}\n${summarize(outcome)}`);
  printReportPath(
    writeReport(
      "gate",
      {
        gate: name,
        status: outcome.status,
        durationMs: Math.round(performance.now() - began),
        steps: outcome.steps,
        obligations: gate.manual,
      },
      values.report,
    ),
  );
  return outcome.status === "passed" ? 0 : 1;
}
