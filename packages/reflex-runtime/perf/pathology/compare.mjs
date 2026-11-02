// Several bundles on one runner: per (case, size), `--samples` rounds, each
// round one process per bundle in rotated order; the median ns per step per
// bundle, and each bundle's median per-round ratio to the first bundle.
//   node perf/pathology/compare.mjs --bundles dir1,dir2,... [--names a,b,...]
//     [--suite consequences] [--cases <regex>] [--samples 5] [--json <file>]
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { cases as clinical } from "./cases.mjs";
import { cases as consequences } from "./consequences.mjs";
import { cases as discovery } from "./discovery.mjs";

const args = process.argv.slice(2);
const opt = (n, f) => (args.includes(n) ? args[args.indexOf(n) + 1] : f);
const suite = opt("--suite", "consequences");
const cases = { clinical, consequences, discovery }[suite];
const bundles = opt("--bundles").split(",").map((b) => path.resolve(b));
const names = (opt("--names") ?? bundles.map((b) => path.basename(b)).join(",")).split(",");
const only = new RegExp(opt("--cases", "."));
const SAMPLES = +opt("--samples", "5");
const runner = path.join(import.meta.dirname, "run.mjs");
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const fmt = (x) =>
  x >= 1e6 ? `${(x / 1e6).toFixed(2)} ms` : x >= 1e3 ? `${(x / 1e3).toFixed(1)} µs` : `${x.toFixed(1)} ns`;

function measure(bundle, name, n) {
  const child = spawnSync(
    process.execPath,
    ["--max-old-space-size=6144", runner, "--measure", bundle, name, String(n), suite],
    { encoding: "utf8", timeout: 300_000 },
  );
  if (child.status !== 0) {
    console.error(child.stderr);
    return null;
  }
  return JSON.parse(child.stdout);
}

const results = {};
const ratioCols = names.slice(1).map((b) => `${b}/${names[0]}`);
console.log(
  `| case | n | ${names.map((b) => `${b} per read`).join(" | ")} | ${ratioCols.join(" | ")} |`,
);
console.log(`|---|---:|${names.map(() => "---:").join("|")}|${ratioCols.map(() => "---:").join("|")}|`);
for (const [name, spec] of Object.entries(cases)) {
  if (!only.test(name)) continue;
  for (const n of spec.sizes) {
    const ns = names.map(() => []);
    let reads = 1;
    let failed = false;
    for (let s = 0; s < SAMPLES && !failed; s++) {
      for (let k = 0; k < bundles.length; k++) {
        const b = (k + s) % bundles.length;
        const r = measure(bundles[b], name, n);
        if (r === null) {
          failed = true;
          break;
        }
        reads = r.reads;
        ns[b].push(r.ns);
      }
    }
    if (failed) {
      console.log(`| ${name} | ${n} | failed |`);
      continue;
    }
    const ratios = names.slice(1).map((_, i) => median(ns[i + 1].map((x, s) => x / ns[0][s])));
    (results[name] ??= []).push({ n, reads, ns, ratios });
    console.log(
      `| ${name} | ${n} | ${ns.map((xs) => fmt(median(xs) / reads)).join(" | ")} | ${ratios.map((r) => r.toFixed(2)).join(" | ")} |`,
    );
  }
}
const json = opt("--json");
if (json) writeFileSync(json, JSON.stringify(results, null, 2));
