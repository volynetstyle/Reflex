import { execFileSync, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FRAMEWORK_METADATA,
  FRAMEWORKS,
  FRAMEWORK_LABELS,
} from "./adapters.mjs";
import { SCENARIOS } from "./scenarios.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const workerPath = resolve(here, "worker.mjs");
const defaultOutput = resolve(
  here,
  "../../../../bench-results/reflex-competitors/latest.json",
);

function repositoryState() {
  const repository = resolve(here, "../../../..");
  try {
    const revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repository,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const dirty =
      execFileSync("git", ["status", "--porcelain"], {
        cwd: repository,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim().length > 0;
    return { revision, dirty };
  } catch {
    return { revision: null, dirty: null };
  }
}

function values(value) {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

function readOption(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function positiveInteger(value, fallback, name) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, received ${value}`);
  }
  return parsed;
}

function nonNegativeInteger(value, fallback, name) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      `${name} must be a non-negative integer, received ${value}`,
    );
  }
  return parsed;
}

function parseOptions(argv) {
  const smoke = argv.includes("--smoke");
  const selectedFrameworks = values(readOption(argv, "--framework"));
  const selectedScenarios = values(readOption(argv, "--scenario"));
  const selectedGroups = values(readOption(argv, "--group"));
  const selectedSizes = values(readOption(argv, "--size")).map(Number);
  const frameworks = selectedFrameworks.length
    ? selectedFrameworks
    : FRAMEWORKS;
  for (const framework of frameworks) {
    if (!FRAMEWORKS.includes(framework))
      throw new Error(`Unknown framework: ${framework}`);
  }
  return {
    smoke,
    frameworks,
    scenarios: selectedScenarios,
    groups: selectedGroups,
    sizes: selectedSizes,
    trials: positiveInteger(
      readOption(argv, "--trials"),
      smoke ? 1 : 5,
      "trials",
    ),
    warmup: positiveInteger(
      readOption(argv, "--warmup"),
      smoke ? 5 : 250,
      "warmup",
    ),
    minWarmupMs: nonNegativeInteger(
      readOption(argv, "--min-warmup-ms"),
      smoke ? 0 : 100,
      "min-warmup-ms",
    ),
    iterations: positiveInteger(
      readOption(argv, "--iterations"),
      smoke ? 20 : 2_000,
      "iterations",
    ),
    minThroughputMs: nonNegativeInteger(
      readOption(argv, "--min-throughput-ms"),
      smoke ? 0 : 250,
      "min-throughput-ms",
    ),
    latencySamples: positiveInteger(
      readOption(argv, "--latency-samples"),
      smoke ? 20 : 2_000,
      "latency-samples",
    ),
    memoryIterations: positiveInteger(
      readOption(argv, "--memory-iterations"),
      smoke ? 20 : 2_000,
      "memory-iterations",
    ),
    timeoutMs: positiveInteger(
      readOption(argv, "--timeout"),
      smoke ? 30_000 : 120_000,
      "timeout",
    ),
    output: resolve(readOption(argv, "--output") ?? defaultOutput),
    jitless: argv.includes("--jitless"),
  };
}

function selectedScenarioDefinitions(options) {
  const selected = SCENARIOS.filter(
    (scenario) =>
      (options.scenarios.length === 0 ||
        options.scenarios.includes(scenario.id)) &&
      (options.groups.length === 0 || options.groups.includes(scenario.group)),
  );
  if (selected.length === 0)
    throw new Error("No scenarios matched the filters");
  return selected;
}

function buildRequests(options) {
  const requests = [];
  const scenarios = selectedScenarioDefinitions(options);
  for (let trial = 0; trial < options.trials; trial++) {
    for (
      let scenarioIndex = 0;
      scenarioIndex < scenarios.length;
      scenarioIndex++
    ) {
      const scenario = scenarios[scenarioIndex];
      const sizes = options.sizes.length
        ? scenario.sizes.filter((size) => options.sizes.includes(size))
        : options.smoke
          ? [scenario.sizes[Math.min(1, scenario.sizes.length - 1)]]
          : scenario.sizes;
      for (const size of sizes) {
        const rotation =
          (trial + scenarioIndex + size) % options.frameworks.length;
        const order = options.frameworks
          .slice(rotation)
          .concat(options.frameworks.slice(0, rotation));
        for (const framework of order) {
          requests.push({
            framework,
            scenario: scenario.id,
            group: scenario.group,
            dimension: scenario.dimension ?? "constant",
            size,
            trial,
            warmup: options.warmup,
            minWarmupMs: options.minWarmupMs,
            iterations: options.iterations,
            minThroughputMs: options.minThroughputMs,
            latencySamples: options.latencySamples,
            memoryIterations: options.memoryIterations,
          });
        }
      }
    }
  }
  if (requests.length === 0) {
    throw new Error("The size filter did not match any selected scenario");
  }
  return requests;
}

function runWorker(request, options) {
  return new Promise((resolvePromise) => {
    const args = ["--expose-gc"];
    if (options.jitless) args.push("--jitless");
    args.push(workerPath, JSON.stringify(request));
    const child = spawn(process.execPath, args, {
      cwd: resolve(here, "../.."),
      env: { ...process.env, NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolvePromise({
        ...request,
        ok: false,
        error: error.stack ?? error.message,
      });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      try {
        const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
        const result = JSON.parse(lines.at(-1));
        if (code !== 0 || signal !== null) {
          resolvePromise({
            ...request,
            ok: false,
            error: timedOut
              ? `Worker timed out after ${options.timeoutMs}ms`
              : `Worker exited code=${code} signal=${signal}`,
            workerResult: result,
            stderr: stderr.trim() || undefined,
          });
          return;
        }
        resolvePromise({ ...result, stderr: stderr.trim() || undefined });
      } catch (error) {
        resolvePromise({
          ...request,
          ok: false,
          error: `Worker exited code=${code} signal=${signal}: ${stderr || stdout || error}`,
        });
      }
    });
  });
}

function median(valuesToSort) {
  const finiteValues = valuesToSort.filter(Number.isFinite);
  if (finiteValues.length === 0) return null;
  const sorted = [...finiteValues].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function medianAbsoluteDeviation(values, center = median(values)) {
  if (center === null || values.length < 2) return null;
  return median(values.map((value) => Math.abs(value - center)));
}

function aggregate(results) {
  const groups = new Map();
  for (const result of results) {
    const key = `${result.scenario}\0${result.size}\0${result.framework}`;
    const group = groups.get(key) ?? [];
    group.push(result);
    groups.set(key, group);
  }
  const rows = [];
  for (const group of groups.values()) {
    const first = group.find((result) => result.ok) ?? group[0];
    const successful = group.filter((result) => result.ok);
    const complete = successful.length === group.length;
    const eligible = successful.filter(
      (result) => result.comparison?.eligible !== false,
    );
    const comparisonReasons = [
      ...new Set(
        successful.map((result) => result.comparison?.reason).filter(Boolean),
      ),
    ];
    // Never publish a survivor-only median. A partially failed group remains
    // in the report but all headline performance metrics are invalidated.
    const metricResults = complete ? successful : [];
    const operationsPerSecond = metricResults.map(
      (result) => result.throughput.operationsPerSecond,
    );
    const medianOpsPerSecond = median(operationsPerSecond);
    const madOpsPerSecond = medianAbsoluteDeviation(
      operationsPerSecond,
      medianOpsPerSecond,
    );
    rows.push({
      scenario: first.scenario,
      group: first.group,
      dimension: first.dimension,
      size: first.size,
      framework: first.framework,
      frameworkLabel: first.frameworkLabel ?? FRAMEWORK_LABELS[first.framework],
      successfulTrials: successful.length,
      failedTrials: group.length - successful.length,
      comparableTrials: eligible.length,
      comparisonEligible: complete && eligible.length === successful.length,
      comparisonReasons,
      medianOpsPerSecond,
      medianAbsoluteDeviationOpsPerSecond: madOpsPerSecond,
      relativeMadPercent:
        medianOpsPerSecond && madOpsPerSecond !== null
          ? (madOpsPerSecond / medianOpsPerSecond) * 100
          : null,
      medianNsPerOperation: median(
        metricResults.map((result) => result.throughput.nsPerOperation),
      ),
      medianP99Ns: median(metricResults.map((result) => result.latencyNs.p99)),
      medianP999Ns: median(
        metricResults.map((result) => result.latencyNs.p999),
      ),
      medianRetainedHeapDeltaBytesPerOperation: median(
        metricResults.map(
          (result) => result.memory.retainedHeapDeltaBytesPerOperation,
        ),
      ),
      medianGcPauseMs: median(
        metricResults.map((result) => result.gc.totalPauseMs),
      ),
      medianSignalReadsPerOperation: median(
        metricResults.map(
          (result) => result.work.throughput.perOperation.signalReads,
        ),
      ),
      medianSignalWritesPerOperation: median(
        metricResults.map(
          (result) => result.work.throughput.perOperation.signalWrites,
        ),
      ),
      medianComputedRunsPerOperation: median(
        metricResults.map(
          (result) => result.work.throughput.perOperation.computedRuns,
        ),
      ),
      medianEffectRunsPerOperation: median(
        metricResults.map(
          (result) => result.work.throughput.perOperation.effectRuns,
        ),
      ),
    });
  }
  for (const row of rows) {
    const rowResults = results.filter(
      (result) =>
        result.ok &&
        result.scenario === row.scenario &&
        result.size === row.size &&
        result.framework === row.framework &&
        result.comparison?.eligible !== false,
    );
    const pairedRatios = row.comparisonEligible
      ? rowResults.flatMap((result) => {
          const reflex = results.find(
            (candidate) =>
              candidate.ok &&
              candidate.framework === "reflex" &&
              candidate.scenario === result.scenario &&
              candidate.size === result.size &&
              candidate.trial === result.trial &&
              candidate.comparison?.eligible !== false,
          );
          return reflex
            ? [
                result.throughput.operationsPerSecond /
                  reflex.throughput.operationsPerSecond,
              ]
            : [];
        })
      : [];
    row.pairedRatioTrials = pairedRatios.length;
    row.throughputVsReflex = median(pairedRatios);
    row.status =
      row.failedTrials > 0
        ? `invalid: ${row.failedTrials} failed trial(s)`
        : !row.comparisonEligible
          ? `not comparable: ${row.comparisonReasons.join("; ")}`
          : "comparable";
  }
  return rows.sort(
    (left, right) =>
      left.scenario.localeCompare(right.scenario) ||
      left.size - right.size ||
      FRAMEWORKS.indexOf(left.framework) - FRAMEWORKS.indexOf(right.framework),
  );
}

function equivalenceAudit(results) {
  const successful = results.filter((result) => result.ok);
  const byTrial = new Map();
  for (const result of successful) {
    const key = `${result.scenario}/${result.size}/trial-${result.trial}`;
    const group = byTrial.get(key) ?? [];
    group.push(result);
    byTrial.set(key, group);
  }
  const failures = [];
  const skipped = [];
  for (const [key, group] of byTrial) {
    const signatures = new Set(
      group.map((result) =>
        [
          result.warmup,
          result.iterations,
          result.latencySamples,
          result.memoryIterations,
        ].join("/"),
      ),
    );
    if (signatures.size !== 1) {
      skipped.push({
        key,
        reason:
          "adaptive minimum-duration measurement produced different trace lengths; each worker passed its own model validation",
        traces: Object.fromEntries(
          group.map((result) => [
            result.framework,
            {
              warmup: result.warmup,
              throughput: result.iterations,
              latency: result.latencySamples,
              memory: result.memoryIterations,
            },
          ]),
        ),
      });
      continue;
    }
    const expected = group[0].observableChecksum;
    for (const result of group.slice(1)) {
      if (!Object.is(result.observableChecksum, expected)) {
        failures.push(
          `${key}: ${group[0].framework}=${expected}, ${result.framework}=${result.observableChecksum}`,
        );
      }
    }
  }
  return { failures, skipped };
}

function csv(rows) {
  const columns = [
    "scenario",
    "group",
    "dimension",
    "size",
    "framework",
    "successfulTrials",
    "failedTrials",
    "comparableTrials",
    "status",
    "medianOpsPerSecond",
    "medianAbsoluteDeviationOpsPerSecond",
    "relativeMadPercent",
    "medianNsPerOperation",
    "medianP99Ns",
    "medianP999Ns",
    "medianSignalReadsPerOperation",
    "medianSignalWritesPerOperation",
    "medianComputedRunsPerOperation",
    "medianEffectRunsPerOperation",
    "medianRetainedHeapDeltaBytesPerOperation",
    "medianGcPauseMs",
    "pairedRatioTrials",
    "throughputVsReflex",
  ];
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => row[column] ?? "").join(",")),
    "",
  ].join("\n");
}

function markdown(report) {
  const lines = [
    "# Reflex competitor benchmark",
    "",
    `Generated: ${report.generatedAt} on ${report.environment.node} / ${report.environment.v8}`,
    "",
    ...(report.mode === "smoke"
      ? [
          "**Smoke mode is a wiring check. Its throughput and latency samples are not performance evidence.**",
          "",
        ]
      : []),
    "Medians are across fresh-process trials. `vs Reflex` is the median of same-trial throughput ratios; values below 1 are slower than Reflex. Ratios are withheld for failed or capability-incompatible runs.",
    "",
    "| Scenario | Size | Framework | Trials | ops/s | MAD % | computed/op | effects/op | p99 ns | p999 ns | vs Reflex | Status |",
    "|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  ];
  for (const row of report.summary) {
    const number = (value, digits = 0) =>
      value === null || !Number.isFinite(Number(value))
        ? "n/a"
        : Number(value).toFixed(digits);
    lines.push(
      `| ${row.scenario} | ${row.size} | ${row.frameworkLabel} | ${row.successfulTrials}/${row.successfulTrials + row.failedTrials} | ${number(row.medianOpsPerSecond)} | ${number(row.relativeMadPercent, 2)} | ${number(row.medianComputedRunsPerOperation, 2)} | ${number(row.medianEffectRunsPerOperation, 2)} | ${number(row.medianP99Ns)} | ${number(row.medianP999Ns)} | ${number(row.throughputVsReflex, 3)} | ${row.status} |`,
    );
  }
  if (report.equivalenceFailures.length) {
    lines.push("", "## Observable-equivalence failures", "");
    for (const failure of report.equivalenceFailures)
      lines.push(`- ${failure}`);
  }
  if (report.equivalenceSkipped.length) {
    lines.push(
      "",
      `Cross-runtime final-checksum comparison was skipped for ${report.equivalenceSkipped.length} adaptive trace group(s) with different operation counts. Every worker still passed its scenario model validation; trace lengths are retained in JSON.`,
    );
  }
  const workerFailures = report.results.filter((result) => !result.ok);
  if (workerFailures.length) {
    lines.push("", "## Worker failures", "");
    for (const failure of workerFailures) {
      lines.push(
        `- ${failure.framework} / ${failure.scenario} / size ${failure.size} / trial ${failure.trial}: ${failure.error}`,
      );
    }
  }
  lines.push(
    "",
    "Heap deltas and GC observations are diagnostics retained in JSON/CSV, not allocation measurements. Raw phase-separated work counters and failures are retained in JSON.",
    "",
  );
  return lines.join("\n");
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const requests = buildRequests(options);
  const results = [];
  for (let index = 0; index < requests.length; index++) {
    const request = requests[index];
    process.stderr.write(
      `[${index + 1}/${requests.length}] ${request.framework} ${request.scenario} size=${request.size} trial=${request.trial}\n`,
    );
    results.push(await runWorker(request, options));
  }
  const summary = aggregate(results);
  const equivalence = equivalenceAudit(results);
  if (options.smoke) {
    for (const row of summary) {
      row.throughputVsReflex = null;
      row.pairedRatioTrials = 0;
      row.relativeMadPercent = null;
      row.status = row.failedTrials
        ? row.status
        : row.comparisonEligible
          ? "smoke only"
          : `smoke only; ${row.status}`;
    }
  }
  const os = await import("node:os");
  const report = {
    schemaVersion: 2,
    mode: options.smoke ? "smoke" : "measurement",
    generatedAt: new Date().toISOString(),
    methodology: {
      isolation: "fresh Node process per framework/scenario/size/trial",
      ordering: "deterministic framework rotation per trial and scenario",
      warmupIterations: options.warmup,
      minimumWarmupMilliseconds: options.minWarmupMs,
      throughputIterations: options.iterations,
      minimumThroughputMilliseconds: options.minThroughputMs,
      latencySamples: options.latencySamples,
      memoryIterations: options.memoryIterations,
      latency: {
        method: "per-operation hrtime; no baseline subtraction",
        minimumSamples: { p99: 100, p999: 10_000 },
      },
      memory: {
        method: "post-GC heap deltas only; not an allocation-byte counter",
        allocationBytesPerOperation: "not available from this Node harness",
      },
    },
    environment: {
      node: process.version,
      v8: process.versions.v8,
      platform: `${process.platform}-${process.arch}`,
      cpuModel: os.cpus()[0]?.model ?? null,
      cpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      osRelease: os.release(),
      jitless: options.jitless,
    },
    frameworks: Object.fromEntries(
      options.frameworks.map((framework) => [
        framework,
        FRAMEWORK_LABELS[framework],
      ]),
    ),
    frameworkMetadata: Object.fromEntries(
      options.frameworks.map((framework) => [
        framework,
        FRAMEWORK_METADATA[framework],
      ]),
    ),
    repository: repositoryState(),
    results,
    summary,
    equivalenceFailures: equivalence.failures,
    equivalenceSkipped: equivalence.skipped,
  };
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(
    options.output,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    options.output.replace(/\.json$/i, ".csv"),
    csv(report.summary),
    "utf8",
  );
  await writeFile(
    options.output.replace(/\.json$/i, ".md"),
    markdown(report),
    "utf8",
  );
  process.stdout.write(`${markdown(report)}\n`);

  if (
    report.equivalenceFailures.length > 0 ||
    results.some((result) => !result.ok)
  ) {
    process.exitCode = 1;
  }
}

await main();
