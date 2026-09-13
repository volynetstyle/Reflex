import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { build, here, output } from "./build.mjs";
const hashes = await build();
console.log(
  execFileSync(process.execPath, [path.join(here, "verify.mjs")], {
    encoding: "utf8",
  }).trim(),
);
const sizes = [0, 1, 16, 31, 32, 33, 64, 256, 1024, 4096];
const workloads = [
  "stable",
  "alternating",
  "replacement",
  "reorder",
  "local-swap",
  "cyclic-left1",
  "cyclic-left2",
  "cyclic-right1",
  "insert-front",
  "failure-retry",
];
const rows = [];
const metadata = {
  ...hashes,
  date: new Date().toISOString(),
  node: process.version,
  cpu: os.cpus()[0].model,
  platform: process.platform,
  sizes,
  workloads,
  samples: 15,
  targetBatchMs: 15,
  structuralOperations: 16,
  policy: "Preserve both; rotate only bounded one-/two-hop matching helper",
  timingUnit: "ns/op",
  tailMeaning: "percentiles of batch means, not individual latency",
};
for (const workload of workloads)
  for (const D of sizes) {
    const row = JSON.parse(
      execFileSync(
        process.execPath,
        ["--expose-gc", path.join(here, "worker.mjs"), workload, String(D)],
        { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
      ),
    );
    rows.push(row);
    fs.writeFileSync(
      path.join(output, "results.json"),
      JSON.stringify({ metadata, rows }, null, 2) + "\n",
    );
    const b = row.move.structural.perOperation,
      a = row.rotate.structural.perOperation;
    console.log(
      `${workload} D=${D}: S ${b.S}->${a.S}; M/B ${b.M}/${b.B}->${a.M}/${a.B}; W ${b.W}->${a.W}; time ${row.timeRatio.toFixed(3)}`,
    );
  }
