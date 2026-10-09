import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildProduction,
  buildB3Control,
  buildB3Mutant,
  outputRoot,
  packageRoot,
} from "./build.mjs";
import { b3Mutations } from "./b3-mutations.mjs";
import { productionMutations } from "./production-mutations.mjs";

const production = process.argv.includes("--production");
const bundle = production ? "P" : "B3";
const mutations = production ? productionMutations : b3Mutations;

const schedules = ["flush", "sab", "eager"];
const captureModes = ["direct", "cached", "pending"];
const reportPath = fileURLToPath(
  new URL(
    production
      ? "../../.cache/async-semantics/production-mutations.json"
      : "mutation-results.json",
    import.meta.url,
  ),
);
const sourcePaths = [
  "src/index.ts",
  "lab/async-semantics/baseline.ts",
  ...[
    "source",
    "attempt",
    "frontier",
    "evaluation",
    "errors",
    "types",
    "wait",
    "failure",
  ].map((name) => `src/async/${name}.ts`),
  "../reflex-runtime/src/protocol/read.producer.ts",
];
const sourceHash = (path) =>
  createHash("sha256")
    .update(readFileSync(resolve(packageRoot, path)))
    .digest("hex");

if (process.argv.includes("--worker")) {
  const id = process.argv[process.argv.indexOf("--worker") + 1];
  const file =
    id === "control" ? `${bundle}.mjs` : `${bundle}-mutant-${id}.mjs`;
  const api = await import(pathToFileURL(resolve(outputRoot, file)).href);
  const results = [];
  for (const captureMode of captureModes) {
    for (const schedule of schedules) {
      try {
        const exploration =
          captureMode === "direct"
            ? await api.runBoundedFrontierDifferential(schedule)
            : captureMode === "cached"
              ? await api.runBoundedCachedFrontierDifferential(schedule)
              : await api.runBoundedPendingCaptureDifferential(schedule);
        results.push({
          captureMode,
          schedule,
          status: "survived",
          exploration,
        });
      } catch (error) {
        results.push({
          captureMode,
          schedule,
          status: "killed",
          witness: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }
    if (results.some((row) => row.status === "killed")) break;
  }
  console.log(JSON.stringify(results));
} else {
  const before = Object.fromEntries(
    sourcePaths.map((path) => [path, sourceHash(path)]),
  );
  const execFileAsync = promisify(execFile);
  const worker = async (id) => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        fileURLToPath(import.meta.url),
        "--worker",
        id,
        ...(production ? ["--production"] : []),
      ],
      {
        windowsHide: true,
        timeout: 90_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    return JSON.parse(stdout);
  };

  if (production) await buildProduction();
  else await buildB3Control();
  const controlRuns = await worker("control");
  if (
    controlRuns.length !== schedules.length * captureModes.length ||
    controlRuns.some(
      (row) => row.status !== "survived" || !row.exploration.complete,
    )
  )
    throw new Error("B3 control failed before mutation qualification");
  console.log(
    `control: ${controlRuns[0].exploration.oracleStates} states, ${controlRuns.length} capture/schedule runs passed`,
  );

  const results = [];
  for (const mutation of mutations) {
    let result;
    try {
      if (production) await buildProduction(mutation);
      else await buildB3Mutant(mutation);
      const runs = await worker(mutation.id);
      result = {
        id: mutation.id,
        status: runs.some((row) => row.status === "killed")
          ? "killed"
          : "survived",
        runs,
      };
    } catch (error) {
      result = {
        id: mutation.id,
        status: "invalid",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    results.push(result);
    const witness = result.runs?.find((row) => row.status === "killed");
    console.log(
      `${result.id}: ${result.status}${witness ? ` (${witness.witness})` : ""}`,
    );
  }

  const after = Object.fromEntries(
    sourcePaths.map((path) => [path, sourceHash(path)]),
  );
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error("Production sources changed during B3 qualification");
  const inputs = [
    "lab/async-semantics/async-spec-machine.ts",
    "lab/async-semantics/b3-mutations.mjs",
    "lab/async-semantics/production-mutations.mjs",
    "lab/async-semantics/build.mjs",
    "lab/async-semantics/entry.ts",
    "lab/async-semantics/evaluation.ts",
    "lab/async-semantics/frontier.ts",
    "lab/async-semantics/qualify-b3-mutations.mjs",
    "lab/async-semantics/pending-capture-machine.ts",
  ];
  const report = {
    recordedAt: new Date().toISOString(),
    node: process.version,
    sourceHashes: before,
    inputHashes: Object.fromEntries(
      inputs.map((path) => [path, sourceHash(path)]),
    ),
    control: controlRuns,
    results,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report: ${reportPath}`);
  if (results.some((row) => row.status !== "killed")) process.exitCode = 1;
}
