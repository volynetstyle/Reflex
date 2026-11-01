// Strike-gate timing: ns per transition of long x long shapes (lab replicas)
// for several runtime production bundles; one process per (sample, case,
// bundle), bundle order rotated per sample; ratio = median of per-sample
// ratios to the first bundle.
//   node time.mjs --bundles base,k8,... --cases <regex> --samples 5 --node <exe>
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { range, shapes } from "./shapes.mjs";

const here = import.meta.dirname;
const args = process.argv.slice(2);
const opt = (n, f) => (args.includes(n) ? args[args.indexOf(n) + 1] : f);

if (args[0] === "--measure") {
  // --measure <bundle> <shape> <d> <k> <warmN|time:ms> <batchN|time:ms> <fzMode:-|record|verify|replay> <traceFile>
  const [, bundle, shape, d, k, warmArg, batchArg, fzMode, traceFile] = args;
  if (fzMode !== "-") {
    const modes = { record: 0, verify: 1, replay: 2 };
    const fz = { mode: modes[fzMode], bits: [], i: 0, h: 0, prepares: 0, releases: 0 };
    if (fz.mode !== 0) fz.bits = new Uint8Array(readFileSync(traceFile + ".bits"));
    globalThis.__fz = fz;
  }
  const rt = await import(pathToFileURL(path.join(here, "bundles", bundle, "runtime.mjs")).href);
  const patterns = shapes[shape](+d, +k);
  const period = patterns.length;
  const poolSize = patterns.flat(2).reduce((m, i) => Math.max(m, i + 1), 0);
  const sel = rt.createProducer(0);
  const src = range(poolSize).map((i) => rt.createProducer(i));
  const cons = patterns[0].map((_, c) => {
    const byPhase = patterns.map((p) => p[c]);
    return rt.createConsumer(() => {
      const pat = byPhase[rt.readProducer(sel) % period];
      let t = 0;
      for (let i = 0; i < pat.length; i++) t += rt.readProducer(src[pat[i]]);
      return t;
    });
  });
  const sum = rt.createConsumer(() => {
    let t = 0;
    for (let i = 0; i < cons.length; i++) t += rt.readConsumer(cons[i]);
    return t;
  });
  rt.readConsumer(sum);
  const expected = patterns.map((ph) => ph.reduce((t, pat) => t + pat.reduce((u, i) => u + i, 0), 0));
  let step = 0, sink = 0;
  const verify = () => {
    for (let t = 0; t < period; t++) {
      rt.writeProducer(sel, ++step);
      const got = rt.readConsumer(sum);
      if (got !== expected[step % period]) throw new Error(`wrong sum ${got} at step ${step}`);
    }
  };
  const run = (n) => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      rt.writeProducer(sel, ++step);
      sink += rt.readConsumer(sum);
    }
    return performance.now() - t0;
  };
  verify();
  let warmN, batchN;
  if (warmArg.startsWith("time:")) {
    let n = 4;
    for (let spent = run(n); spent < +warmArg.slice(5); spent += run(n)) n *= 2;
    const per = run(n) / n;
    console.log(JSON.stringify({ per }));
    process.exit(0);
  }
  warmN = +warmArg; batchN = +batchArg;
  run(warmN);
  verify();
  const times = [];
  for (let b = 0; b < 5; b++) times.push((run(batchN) * 1e6) / batchN);
  verify();
  times.sort((a, b) => a - b);
  if (!Number.isFinite(sink)) throw new Error("sink");
  const fz = globalThis.__fz;
  if (fz && fz.mode === 0) {
    writeFileSync(traceFile + ".bits", Uint8Array.from(fz.bits));
  }
  if (fz && fz.mode !== 0 && fz.i !== fz.bits.length) throw new Error(`trace not consumed: ${fz.i}/${fz.bits.length}`);
  const ctl = fz ? { h: fz.h, prepares: fz.prepares, releases: fz.releases, foreign: fz.mode === 0 ? fz.bits.length : fz.i, struck: fz.mode === 0 ? fz.bits.reduce((a, b) => a + b, 0) : undefined } : null;
  console.log(JSON.stringify({ ns: times[2], ctl }));
  process.exit(0);
}

const caseRe = new RegExp(opt("--cases", "."));
const samples = +opt("--samples", 5);
const node = opt("--node", process.execPath);
const sizes = [[64, 16], [64, 128], [256, 16], [256, 128]];
const cases = Object.keys(shapes).flatMap((s) => sizes.map(([d, k]) => ({ s, d, k, id: `${s} ${d}x${k}` }))).filter((c) => caseRe.test(c.id));
const traceDir = path.join(here, "traces");
mkdirSync(traceDir, { recursive: true });
const call = (b, c, w, n, mode, trace) => {
  const r = spawnSync(node, ["--max-old-space-size=4096", import.meta.filename, "--measure", b, c.s, c.d, c.k, w, n, mode, trace], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`${b} ${c.id} ${mode}: ${r.stderr.slice(0, 600)}`);
  return JSON.parse(r.stdout.trim().split("\n").pop());
};
const plan = {};
for (const c of cases) {
  const big = c.d * c.k >= 256 * 128;
  const { per } = call("base", c, "time:150", "-", "-", "-");
  const warmN = Math.max(16, Math.ceil((big ? 300 : 150) / per));
  const batchN = Math.max(4, Math.ceil((big ? 60 : 30) / per));
  const trace = path.join(traceDir, c.id.replace(/\W+/g, "_"));
  const rec = call("fz-a", c, warmN, batchN, "record", trace);
  plan[c.id] = { warmN, batchN, trace, ctl: rec.ctl };
  process.stderr.write(`${c.id}: warm ${warmN} batch ${batchN} foreign ${rec.ctl.foreign} struck ${rec.ctl.struck} prepares ${rec.ctl.prepares} releases ${rec.ctl.releases}\n`);
}
const bundles = [["base", "-"], ["fz-a", "verify"], ["fz-b", "replay"]];
const res = {};
for (let sm = 0; sm < samples; sm++) {
  for (const c of cases) {
    const p = plan[c.id];
    for (let j = 0; j < bundles.length; j++) {
      const [b, mode] = bundles[(j + sm) % bundles.length];
      const out = call(b, c, p.warmN, p.batchN, mode, p.trace);
      if (out.ctl) for (const key of ["h", "prepares", "releases", "foreign"]) if (out.ctl[key] !== p.ctl[key]) throw new Error(`${b} ${c.id}: controller ${key} ${out.ctl[key]} != recorded ${p.ctl[key]}`);
      ((res[c.id] ??= {})[b] ??= []).push(out.ns);
    }
  }
  process.stderr.write(`sample ${sm + 1}/${samples}\n`);
}
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
const ratio = (r, x, y) => med(r[x].map((v, i) => v / r[y][i])).toFixed(3);
const fmt = (ns) => (ns >= 1e6 ? `${(ns / 1e6).toFixed(2)} ms` : `${(ns / 1e3).toFixed(1)} µs`);
console.log("| case | foreign lookups / transition | struck | prepares / transition | base | A'/base | **B'/A'** |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const c of cases) {
  const r = res[c.id], p = plan[c.id];
  const transitions = p.warmN + 5 * p.batchN + 3 * shapes[c.s](c.d, c.k).length;
  const per = (x) => (x / transitions).toFixed(1);
  console.log(`| ${c.id} | ${per(p.ctl.foreign)} | ${p.ctl.struck} | ${per(p.ctl.prepares)} | ${fmt(med(r.base))} | ${ratio(r, "fz-a", "base")} | **${ratio(r, "fz-b", "fz-a")}** |`);
}
