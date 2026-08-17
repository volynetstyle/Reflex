import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BenchmarkReport, WorkerRequest, WorkerResult } from "./protocol.js";
import type { FrameworkName, Policy, SuiteName } from "./types.js";
import { workloads } from "./workloads/index.js";

interface Options {
  suites: SuiteName[];
  frameworks: FrameworkName[];
  caseFilter?: string;
  sizes?: number[];
  policies?: Policy[];
  warmup: number;
  iterations: number;
  samples: number;
  output: string;
  smoke: boolean;
  jitless: boolean;
}

const compiledRoot = dirname(fileURLToPath(import.meta.url));

function values(value: string | undefined): string[] {
  return value?.split(",").filter(Boolean) ?? [];
}

function parseOptions(argv: readonly string[]): Options {
  const read = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index === -1 ? undefined : argv[index + 1];
  };
  const smoke = argv.includes("--smoke");
  return {
    suites: (values(read("--suite")) as SuiteName[]).length
      ? (values(read("--suite")) as SuiteName[])
      : ["vue-12349-exact", "vue-12349-corrected", "diagnostic"],
    frameworks: (values(read("--framework")) as FrameworkName[]).length
      ? (values(read("--framework")) as FrameworkName[])
      : ["alien", "reflex"],
    caseFilter: read("--case"),
    sizes: values(read("--size")).map(Number),
    policies: values(read("--policy")) as Policy[],
    warmup: Number(read("--warmup") ?? (smoke ? 2 : 200)),
    iterations: Number(read("--iterations") ?? (smoke ? 3 : 2000)),
    samples: Number(read("--samples") ?? (smoke ? 1 : 50)),
    output: resolve(read("--output") ?? "results/latest.json"),
    smoke,
    jitless: argv.includes("--jitless"),
  };
}

function buildRequests(options: Options): WorkerRequest[] {
  const requests: WorkerRequest[] = [];
  for (const workload of workloads) {
    if (!options.suites.includes(workload.suite)) continue;
    if (options.caseFilter && !workload.id.includes(options.caseFilter)) continue;
    const sizes = options.sizes?.length
      ? options.sizes
      : workload.suite === "diagnostic"
        ? options.smoke ? [10] : [10, 100, 1000, 4096]
        : [workload.defaultSize ?? 1];
    const policies = (options.policies?.length
      ? options.policies
      : workload.supportedPolicies ?? ["eager"]
    ).filter((policy) => workload.supportedPolicies?.includes(policy) ?? true);

    for (const framework of options.frameworks) {
      for (const size of sizes) {
        for (const policy of policies) {
          requests.push({
            framework,
            workloadId: workload.id,
            size,
            policy,
            warmup: options.warmup,
            iterations: options.iterations,
            samples: options.samples,
          });
        }
      }
    }
  }
  return requests;
}

function runWorker(request: WorkerRequest, jitless: boolean): Promise<WorkerResult> {
  return new Promise((resolvePromise, reject) => {
    const workerPath = resolve(compiledRoot, "worker.js");
    const nodeArgs = ["--expose-gc", ...(jitless ? ["--jitless"] : []), workerPath, JSON.stringify(request)];
    const child = spawn(process.execPath, nodeArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker ${request.framework}/${request.workloadId} failed (${code}):\n${stderr}`));
        return;
      }
      try {
        resolvePromise(JSON.parse(stdout.trim()) as WorkerResult);
      } catch (error) {
        reject(new Error(`Invalid worker JSON: ${stdout}\n${stderr}`, { cause: error }));
      }
    });
  });
}

function equivalenceFailures(results: readonly WorkerResult[]): string[] {
  const groups = new Map<string, WorkerResult[]>();
  for (const result of results) {
    const key = `${result.workloadId}/${result.size}/${result.policy}`;
    const group = groups.get(key) ?? [];
    group.push(result);
    groups.set(key, group);
  }
  const failures: string[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const baseline = group[0]!;
    for (const candidate of group.slice(1)) {
      for (const counter of ["signalWrites", "computedRuns", "effectRuns"] as const) {
        if (baseline.counters[counter] !== candidate.counters[counter]) {
          failures.push(`${key}: ${counter} ${baseline.framework}=${baseline.counters[counter]} ${candidate.framework}=${candidate.counters[counter]}`);
        }
      }
      if (!Object.is(baseline.counters.checksum, candidate.counters.checksum)) {
        failures.push(`${key}: checksum ${baseline.framework}=${baseline.counters.checksum} ${candidate.framework}=${candidate.counters.checksum}`);
      }
    }
  }
  return failures;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const requests = buildRequests(options);
  if (requests.length === 0) throw new Error("No benchmark cases matched the filters");
  const results: WorkerResult[] = [];
  for (const [index, request] of requests.entries()) {
    process.stderr.write(`[${index + 1}/${requests.length}] ${request.framework} ${request.workloadId} size=${request.size} policy=${request.policy}\n`);
    results.push(await runWorker(request, options.jitless));
  }
  const report: BenchmarkReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    node: process.version,
    isolatedBy: "process",
    results,
    equivalenceFailures: equivalenceFailures(results),
  };
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.equivalenceFailures.length !== 0) process.exitCode = 2;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
