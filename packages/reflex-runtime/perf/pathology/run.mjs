// Clinical workloads (cases.mjs) on a production bundle: time per user step,
// per user read, and the growth exponent between sizes (1 = linear in n,
// 2 = quadratic). One process per (case, size).
//   node perf/pathology/run.mjs --bundle <dir with runtime.mjs> [--cases <regex>] [--json <file>]
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { cases as clinical } from "./cases.mjs";
import { cases as consequences } from "./consequences.mjs";
import { cases as discovery } from "./discovery.mjs";

export const suites = { clinical, consequences, discovery };

const args = process.argv.slice(2);
const opt = (n, f) => (args.includes(n) ? args[args.indexOf(n) + 1] : f);

if (args[0] === "--measure") {
  const [, bundle, name, size, suite = "clinical"] = args;
  const cases = suites[suite];
  const rt = await import(
    pathToFileURL(path.resolve(bundle, "runtime.mjs")).href
  );
  const n = +size;
  const t0 = performance.now();
  const { op, reads, check } = cases[name].build(rt, n);
  const setupMs = performance.now() - t0;
  let sink = 0;
  // Warm-up: at least 3 steps and 300 ms.
  const w0 = performance.now();
  let warm = 0;
  while (warm < 3 || performance.now() - w0 < 300) {
    sink += +op() || 0;
    warm++;
  }
  if (check && !check(op())) throw new Error(`${name}: check failed`);
  // Seven samples of at least 1 step and 100 ms each; median ns per step.
  const samples = [];
  for (let s = 0; s < 7; s++) {
    let steps = 0;
    const s0 = performance.now();
    let el = 0;
    while (steps < 1 || el < 100) {
      sink += +op() || 0;
      steps++;
      el = performance.now() - s0;
    }
    samples.push((el * 1e6) / steps);
  }
  samples.sort((a, b) => a - b);
  const heapMb = process.memoryUsage().heapUsed / 2 ** 20;
  process.stdout.write(
    JSON.stringify({ ns: samples[3], reads, setupMs, heapMb, sink: sink % 7 }),
  );
  process.exit(0);
}

if (!import.meta.main) {
  // imported by compare.mjs
} else {
const cases = clinical;
const bundle = path.resolve(opt("--bundle", "perf/pathology/bundle"));
const only = new RegExp(opt("--cases", "."));
const results = {};
const fmt = (x, d = 0) =>
  x >= 1e6
    ? `${(x / 1e6).toFixed(2)} ms`
    : x >= 1e3
      ? `${(x / 1e3).toFixed(1)} µs`
      : `${x.toFixed(d)} ns`;

console.log(
  "| case | n | per step | per user read | exponent | heap MB | setup ms |",
);
console.log("|---|---:|---:|---:|---:|---:|---:|");
for (const [name, spec] of Object.entries(cases)) {
  if (!only.test(name)) continue;
  let prev = null;
  for (const n of spec.sizes) {
    const child = spawnSync(
      process.execPath,
      [
        "--max-old-space-size=6144",
        "--stack-size=4000",
        import.meta.filename,
        "--measure",
        bundle,
        name,
        String(n),
      ],
      { encoding: "utf8", timeout: 240_000 },
    );
    if (child.status !== 0) {
      const why = (child.stderr || child.error?.message || "")
        .trim()
        .split("\n")
        .slice(-1)[0];
      console.log(`| ${name} | ${n} | failed: ${why} | | | | |`);
      console.error(child.stderr);
      prev = null;
      continue;
    }
    const r = JSON.parse(child.stdout);
    (results[name] ??= []).push({ n, ...r });
    const exponent = prev
      ? (Math.log(r.ns / prev.ns) / Math.log(n / prev.n)).toFixed(2)
      : "";
    console.log(
      `| ${name} | ${n} | ${fmt(r.ns)} | ${fmt(r.ns / r.reads, 1)} | ${exponent} | ${r.heapMb.toFixed(0)} | ${r.setupMs.toFixed(0)} |`,
    );
    prev = { n, ns: r.ns };
  }
}
const json = opt("--json");
if (json) writeFileSync(json, JSON.stringify(results, null, 2));
}
