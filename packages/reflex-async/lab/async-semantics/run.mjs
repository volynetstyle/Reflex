import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  buildVariants,
  buildProduction,
  packageRoot,
  outputRoot,
} from "./build.mjs";
import { runPerformance } from "./performance.mjs";

const hash = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const sourcePaths = [
  "src/index.ts",
  ...[
    "source",
    "frontier",
    "attempt",
    "evaluation",
    "types",
    "errors",
    "failure",
    "wait",
  ].map((name) => `src/async/${name}.ts`),
  "lab/async-semantics/baseline.ts",
  "../reflex-runtime/src/protocol/read.producer.ts",
];
const sourceHashes = () =>
  Object.fromEntries(
    sourcePaths.map((path) => [path, hash(resolve(packageRoot, path))]),
  );
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

if (process.argv.includes("--worker")) {
  const variant = process.argv[process.argv.indexOf("--worker") + 1];
  const variants = ["A", "B1", "B2", "B", "B3", "C", "P"];
  if (!variants.includes(variant)) throw new Error("Invalid variant");
  const api = await import(
    pathToFileURL(resolve(outputRoot, `${variant}.mjs`)).href
  );
  let result;
  if (process.argv.includes("--correctness")) {
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    try {
      result = await api.runCorpus(dom.window.document);
    } finally {
      dom.window.close();
    }
  } else if (process.argv.includes("--exploration")) {
    result = [];
    for (const schedule of ["flush", "sab", "eager"]) {
      result.push(await api.runBoundedFrontierDifferential(schedule));
      result.push(await api.runBoundedCachedFrontierDifferential(schedule));
      result.push(await api.runBoundedPendingCaptureDifferential(schedule));
    }
  } else
    result = runPerformance(
      api,
      JSON.parse(process.env.REFLEX_ASYNC_LAB_ITERATIONS ?? "{}"),
    );
  console.log(JSON.stringify(result));
} else {
  const before = sourceHashes();
  const productionOnly = process.argv.includes("--production-only");
  if (productionOnly) await buildProduction();
  else await buildVariants();
  const rounds =
    productionOnly || process.argv.includes("--correctness-only")
      ? 0
      : Number(process.env.REFLEX_ASYNC_LAB_ROUNDS ?? 3);
  if (!Number.isInteger(rounds) || rounds < 0 || rounds > 10)
    throw new Error("Rounds must be 0-10");
  const child = promisify(execFile);
  async function worker(variant, correctness, iterations, exploration = false) {
    const { stdout } = await child(
      process.execPath,
      [
        "--expose-gc",
        fileURLToPath(import.meta.url),
        "--worker",
        variant,
        ...(correctness
          ? ["--correctness"]
          : exploration
            ? ["--exploration"]
            : []),
      ],
      {
        windowsHide: true,
        timeout: 60_000,
        maxBuffer: 4 * 1024 * 1024,
        env: {
          ...process.env,
          REFLEX_ASYNC_LAB_ITERATIONS: JSON.stringify(iterations ?? {}),
        },
      },
    );
    return JSON.parse(stdout);
  }
  const correctness = {};
  const variantNames = productionOnly
    ? ["P"]
    : ["A", "B1", "B2", "B", "B3", "C"];
  const runs = Object.fromEntries(variantNames.map((variant) => [variant, []]));
  for (const variant of variantNames) {
    correctness[variant] = await worker(variant, true);
    const failed = correctness[variant].filter((row) => !row.passed);
    console.log(
      `${variant}: ${correctness[variant].length - failed.length}/${correctness[variant].length} correctness cases passed`,
    );
    for (const row of failed)
      console.log(
        `  ${row.strategy}: ${row.name}: ${row.error.split("\n")[0]}`,
      );
  }
  const exploration = await worker(
    productionOnly ? "P" : "B3",
    false,
    undefined,
    true,
  );
  for (const row of exploration)
    console.log(
      `${productionOnly ? "P" : "B3"} bounded ${row.captureMode} ${row.schedules[0]}: ${row.oracleStates}/${row.maxStates} states, ${row.transitions} transitions, ${row.replays} runtime replays (depth ${row.depth}, complete ${row.complete})`,
    );
  let iterations;
  for (let round = 0; round < rounds; ++round) {
    // Rotate all variants through first/middle/last positions in separate processes.
    const order = [...variantNames];
    order.push(...order.splice(0, round % 3));
    for (const variant of order) {
      const result = await worker(variant, false, iterations);
      runs[variant].push(result);
      iterations ??= Object.fromEntries(
        result.map((row) => [row.name, row.iterations]),
      );
      console.log(`${variant}: performance round ${round + 1}/${rounds}`);
    }
  }
  const scenarios =
    rounds === 0
      ? []
      : runs.A[0].map(({ name }, index) => {
          const variants = Object.fromEntries(
            variantNames.map((variant) => {
              const samples = runs[variant].flatMap(
                (run) => run[index].nsPerOp,
              );
              return [
                variant,
                {
                  medianNs: median(samples),
                  rangeNs: [Math.min(...samples), Math.max(...samples)],
                },
              ];
            }),
          );
          return {
            name,
            variants,
            deltasVsA: Object.fromEntries(
              variantNames
                .slice(1)
                .map((variant) => [
                  variant,
                  (variants[variant].medianNs / variants.A.medianNs - 1) * 100,
                ]),
            ),
          };
        });
  const after = sourceHashes();
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error("Production sources changed during experiment");
  const report = {
    recordedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    cpu: cpus()[0]?.model,
    rounds,
    samplesPerRound: 7,
    sourceHashes: before,
    experimentHashes: Object.fromEntries(
      [
        "async-spec-machine.ts",
        "assertions.ts",
        "build.mjs",
        "correctness.ts",
        "entry.ts",
        "evaluation.ts",
        "frontier.ts",
        "performance.mjs",
        "pending-capture-machine.ts",
        "run.mjs",
      ].map((file) => [
        file,
        hash(fileURLToPath(new URL(file, import.meta.url))),
      ]),
    ),
    bundleHashes: Object.fromEntries(
      variantNames.map((v) => [v, hash(resolve(outputRoot, `${v}.mjs`))]),
    ),
    correctness,
    exploration,
    scenarios,
    iterations,
    runs,
  };
  const path = resolve(
    outputRoot,
    productionOnly
      ? "production-correctness.json"
      : rounds === 0
        ? "correctness.json"
        : "report.json",
  );
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
  for (const row of scenarios)
    console.log(
      `${row.name}: ${Object.entries(row.deltasVsA)
        .map(([variant, delta]) => `${variant} ${delta.toFixed(1)}%`)
        .join(", ")} vs A`,
    );
  console.log(`Report: ${path}`);
  const knownCounterexamples = new Set([
    "nested pending",
    "computed chain -> DOM effect boundary",
    "cached async -> sync -> async frontier",
    "cached diamond frontier",
  ]);
  const variantsThatNeedFrontiers = new Set(["B2", "B", "B3", "P"]);
  const unexpected = Object.entries(correctness).flatMap(([variant, rows]) =>
    rows.filter(
      (row) =>
        !row.passed &&
        (variantsThatNeedFrontiers.has(variant) ||
          !knownCounterexamples.has(row.name)),
    ),
  );
  // B and all source lifecycle checks must pass; known A/C counterexamples remain visible.
  if (
    unexpected.length > 0 ||
    (process.argv.includes("--require-all-pass") &&
      Object.values(correctness)
        .flat()
        .some((row) => !row.passed))
  )
    process.exitCode = 1;
}
