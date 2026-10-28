// Turns selected suites into processes and runs them. Vitest suites that
// share a config, a working directory and a budget run in one vitest process
// (one transform and import of the sources instead of one per suite); every
// other runner is its own process. Steps run in catalog order, so cheap
// layers fail first.
import { createRequire } from "node:module";
import path from "node:path";

import { packageRoot } from "./paths.mjs";
import { pnpmCliPath, render, run, vitestCli } from "./process.mjs";
import { formatMs, table } from "./report.mjs";

const require = createRequire(path.join(packageRoot, "package.json"));
const binOf = (name, bin = name) => {
  const manifest = require.resolve(`${name}/package.json`);
  const field = require(manifest).bin;
  return path.join(
    path.dirname(manifest),
    typeof field === "string" ? field : field[bin],
  );
};

async function command(runner) {
  switch (runner.type) {
    case "node":
      return [process.execPath, runner.args];
    case "testkit":
      return [
        process.execPath,
        [path.join(packageRoot, "testkit/cli.mjs"), ...runner.args],
      ];
    case "tsc":
      return [
        process.execPath,
        [
          binOf("typescript", "tsc"),
          "--noEmit",
          ...(runner.project ? ["-p", runner.project] : []),
        ],
      ];
    case "prettier":
      return [process.execPath, [binOf("prettier"), "--check", "."]];
    case "eslint":
      return [process.execPath, [binOf("eslint"), "."]];
    case "pnpm":
      return [process.execPath, [await pnpmCliPath(), ...runner.args]];
    default:
      throw new Error(`unknown runner type ${runner.type}`);
  }
}

/** Plans the processes for `suites` at `tier`: [{ suites, cwd, env, exe, args }]. */
export async function plan(suites, tier) {
  const steps = [];
  const groups = new Map();
  for (const item of suites) {
    const env = item.budgets?.[tier] ?? {};
    const cwd = path.resolve(packageRoot, item.runner.cwd ?? ".");
    if (item.runner.type === "vitest") {
      const key = JSON.stringify([item.runner.config, cwd, env]);
      let step = groups.get(key);
      if (step === undefined) {
        step = {
          suites: [],
          cwd,
          env,
          exe: process.execPath,
          args: [vitestCli(), "run", "--config", item.runner.config],
        };
        groups.set(key, step);
        steps.push(step);
      }
      step.suites.push(item.id);
      step.args.push(...(item.files ?? []));
      continue;
    }
    const [exe, args] = await command(item.runner);
    steps.push({ suites: [item.id], cwd, env, exe, args });
  }
  return steps;
}

/**
 * Runs the planned steps. Stops at the first failure unless `keepGoing`.
 * Returns { status, steps: [{ suites, command, code, ms, status }] }.
 */
export async function execute(
  steps,
  { keepGoing = false, dryRun = false } = {},
) {
  const results = [];
  let failed = false;
  for (const step of steps) {
    const shown = render(step.exe, step.args, step.env);
    const cwd = path.relative(packageRoot, step.cwd) || ".";
    if (dryRun) {
      console.log(`[${step.suites.join(", ")}]\n  (${cwd}) ${shown}`);
      results.push({
        suites: step.suites,
        command: shown,
        cwd,
        status: "planned",
      });
      continue;
    }
    if (failed && !keepGoing) {
      results.push({
        suites: step.suites,
        command: shown,
        cwd,
        status: "skipped",
      });
      continue;
    }
    console.log(`\n▶ ${step.suites.join(", ")}\n  (${cwd}) ${shown}`);
    const { code, ms } = await run(step.exe, step.args, {
      cwd: step.cwd,
      env: step.env,
    });
    const status = code === 0 ? "passed" : "failed";
    if (status === "failed") failed = true;
    results.push({
      suites: step.suites,
      command: shown,
      cwd,
      code,
      ms,
      status,
    });
  }
  return {
    status: dryRun ? "planned" : failed ? "failed" : "passed",
    steps: results,
  };
}

export function summarize(outcome) {
  return table(
    outcome.steps.map((step) => ({
      status: step.status,
      time: step.ms === undefined ? "" : formatMs(step.ms),
      suites: step.suites.join(", "),
    })),
    ["status", "time", "suites"],
  );
}
