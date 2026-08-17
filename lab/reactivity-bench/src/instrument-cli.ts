import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const compiledRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const worker = resolve(compiledRoot, "instrument-worker.js");
const widths = [10, 100, 1000, 4096];
const cases = [
  ...[1, 4, 16].map((depth) => `wide-shared-sink/depth-${depth}/shared`),
  "rotating-dependencies/rotate-by-one",
];

function run(request: object): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [worker, JSON.stringify(request)], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr));
      else resolvePromise(JSON.parse(stdout));
    });
  });
}

const results: unknown[] = [];
for (const workloadId of cases) {
  for (const size of widths) {
    for (const framework of ["alien", "reflex"] as const) {
      results.push(await run({ framework, workloadId, size, policy: "eager", warmup: 5, iterations: 10 }));
    }
  }
}
process.stdout.write(`${JSON.stringify({ schemaVersion: 1, instrumented: true, results }, null, 2)}\n`);
