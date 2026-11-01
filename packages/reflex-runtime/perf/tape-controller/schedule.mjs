// Finger-race schedule experiment under a frozen tape controller.
//
// Bundles s-<variant> (overlays/schedule): in record mode the finger path is
// dev's race with live strikes and one trace bit per finger lookup records
// whether it struck; in replay mode the variant race runs without strikes and
// the bit is replayed. Every replay must reproduce the recorded controller
// history (prepare/release hash and counts) and consume the whole trace.
//
//   node schedule.mjs time  --bundles s-half,s-rounds,... [--samples 9] [--cases re]
//        ratios to the first bundle; CI only (never time locally)
//   node schedule.mjs count --bundles st-half,st-rounds,... [--cases re]
//        settlement counters of instrumented bundles (overlays/schedule/instrument.py)
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { buildGraph, shapes } from "./shapes.mjs";

const here = import.meta.dirname;
const args = process.argv.slice(2);
const opt = (n, f) => (args.includes(n) ? args[args.indexOf(n) + 1] : f);

if (args[0] === "--child") {
  // --child <bundle> <shape> <d> <k> <warmN> <batchN> <record|replay> <trace>
  const [, bundle, shape, d, k, warmN, batchN, mode, trace] = args;
  const fz = { mode: mode === "record" ? 0 : 2, bits: new Uint8Array(1 << 16), n: 0, i: 0, h: 0, prepares: 0, releases: 0 };
  if (fz.mode === 2) fz.bits = new Uint8Array(readFileSync(trace));
  globalThis.__fz = fz;
  globalThis.__sched = {};
  const rt = await import(pathToFileURL(path.join(here, "bundles", bundle, "runtime.mjs")).href);
  const g = buildGraph(rt, shape, +d, +k);
  let sink = 0;
  const run = (n) => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) sink += g.next();
    return performance.now() - t0;
  };
  g.verify();
  run(+warmN);
  g.verify();
  const times = [];
  for (let b = 0; b < 5; b++) times.push((run(+batchN) * 1e6) / +batchN);
  g.verify();
  if (!Number.isFinite(sink)) throw new Error("sink");
  if (fz.mode === 0) writeFileSync(trace, fz.bits.subarray(0, fz.n));
  else if (fz.i !== fz.bits.length) throw new Error(`trace not consumed: ${fz.i}/${fz.bits.length}`);
  times.sort((a, b) => a - b);
  const lookups = fz.mode === 0 ? fz.n : fz.i;
  const struck = fz.mode === 0 ? fz.bits.subarray(0, fz.n).reduce((a, b) => a + b, 0) : undefined;
  console.log(JSON.stringify({ ns: times[2], ctl: { h: fz.h, prepares: fz.prepares, releases: fz.releases, lookups, struck }, sc: globalThis.__sched }));
  process.exit(0);
}

const [command] = args;
const bundles = opt("--bundles", "s-half,s-rounds").split(",");
const caseRe = new RegExp(opt("--cases", "."));
const samples = +opt("--samples", command === "count" ? 1 : 9);
const sizes = [[64, 16], [64, 128], [256, 16], [256, 128]];
const cases = Object.keys(shapes)
  .flatMap((s) => sizes.map(([d, k]) => ({ s, d, k, id: `${s} ${d}x${k}` })))
  .filter((c) => caseRe.test(c.id));
const traceDir = path.join(here, "traces");
mkdirSync(traceDir, { recursive: true });
const child = (b, c, warmN, batchN, mode, trace) => {
  const r = spawnSync(process.execPath, ["--max-old-space-size=4096", import.meta.filename, "--child", b, c.s, c.d, c.k, warmN, batchN, mode, trace], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`${b} ${c.id} ${mode}: ${r.stderr.slice(0, 800)}`);
  return JSON.parse(r.stdout.trim().split("\n").pop());
};
const checkCtl = (b, c, got, want) => {
  for (const key of ["h", "prepares", "releases", "lookups"])
    if (got[key] !== want[key]) throw new Error(`${b} ${c.id}: controller ${key} ${got[key]} != recorded ${want[key]}`);
};

// Fixed transition counts per case, from one untimed calibration run of the
// first bundle in record mode (so record and replays see the same lookups).
const plan = {};
for (const c of cases) {
  const trace = path.join(traceDir, `${c.id.replace(/\W+/g, "_")}.bits`);
  let warmN = 2, batchN = 1;
  if (command === "time") {
    const probe = child(bundles[0], c, 8, 8, "record", trace);
    const per = probe.ns / 1e6; // ms per transition
    const big = c.d * c.k >= 256 * 128;
    warmN = Math.max(16, Math.ceil((big ? 300 : 150) / per));
    batchN = Math.max(4, Math.ceil((big ? 60 : 30) / per));
  }
  const rec = child(bundles[0], c, warmN, batchN, "record", trace);
  plan[c.id] = { warmN, batchN, trace, ctl: rec.ctl };
  process.stderr.write(`${c.id}: warm ${warmN} batch ${batchN} finger lookups ${rec.ctl.lookups} struck ${rec.ctl.struck} prepares ${rec.ctl.prepares}\n`);
}

const res = {};
for (let sm = 0; sm < samples; sm++) {
  for (const c of cases) {
    const p = plan[c.id];
    for (let j = 0; j < bundles.length; j++) {
      const b = bundles[(j + sm) % bundles.length];
      const out = child(b, c, p.warmN, p.batchN, "replay", p.trace);
      checkCtl(b, c, out.ctl, p.ctl);
      ((res[c.id] ??= {})[b] ??= []).push(out);
    }
  }
  process.stderr.write(`sample ${sm + 1}/${samples}\n`);
}

const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
const fmt = (ns) => (ns >= 1e6 ? `${(ns / 1e6).toFixed(2)} ms` : `${(ns / 1e3).toFixed(1)} µs`);
if (command === "time") {
  const [ref, ...others] = bundles;
  console.log(`| case | finger lookups / transition | ${ref} | ${others.map((b) => `${b}/${ref}`).join(" | ")} |`);
  console.log(`| --- | ---: | ---: | ${others.map(() => "---:").join(" | ")} |`);
  for (const c of cases) {
    const r = res[c.id], p = plan[c.id];
    const transitions = p.warmN + 5 * p.batchN + 3 * shapes[c.s](c.d, c.k).length;
    const ratios = others.map((b) => med(r[b].map((o, i) => o.ns / r[ref][i].ns)).toFixed(3));
    console.log(`| ${c.id} | ${(p.ctl.lookups / transitions).toFixed(1)} | ${fmt(med(r[ref].map((o) => o.ns)))} | ${ratios.join(" | ")} |`);
  }
} else {
  // Per finger lookup: where it settled (race walkers, quiet tail, tape) and probes spent.
  const cols = [
    ["out", (s) => s.byOut], ["out∅", (s) => s.nullOut], ["finger", (s) => s.byFinger],
    ["back", (s) => s.byBack], ["ahead", (s) => s.byAhead], ["in∅", (s) => s.nullIn],
    ["tape", (s) => (s.certEntry ?? 0) + (s.byTape ?? 0)],
    ["tail", (s) => s.tail],
  ];
  const probes = [
    ["base", (s) => s.pBase + (s.tail_pBase ?? 0)], ["finger", (s) => s.pFinger], ["in", (s) => s.pIn + (s.tail_pIn ?? 0)],
  ];
  console.log(`| case | bundle | lookups | ${cols.map(([n]) => `${n} %`).join(" | ")} | probes/lookup: ${probes.map(([n]) => n).join(" / ")} |`);
  console.log(`| --- | --- | ---: | ${cols.map(() => "---:").join(" | ")} | ---: |`);
  for (const c of cases) {
    for (const b of bundles) {
      const s = Object.fromEntries(Object.entries(res[c.id][b][0].sc));
      const n = plan[c.id].ctl.lookups || 1;
      const z = (f) => f(new Proxy(s, { get: (o, k) => o[k] ?? 0 }));
      console.log(`| ${c.id} | ${b} | ${plan[c.id].ctl.lookups} | ${cols.map(([, f]) => ((100 * z(f)) / n).toFixed(1)).join(" | ")} | ${probes.map(([, f]) => (z(f) / n).toFixed(1)).join(" / ")} |`);
    }
  }
}
