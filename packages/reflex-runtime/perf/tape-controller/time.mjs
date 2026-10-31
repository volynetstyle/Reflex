// Strike-gate timing: ns per transition of long x long shapes (lab replicas)
// for several runtime production bundles; one process per (sample, case,
// bundle), bundle order rotated per sample; ratio = median of per-sample
// ratios to the first bundle.
//   node time.mjs --bundles base,k8,... --cases <regex> --samples 5 --node <exe>
import { spawnSync } from "node:child_process";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const here = import.meta.dirname;
const range = (n) => Array.from({ length: n }, (_, i) => i);
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (xs, r) => {
  const o = [...xs];
  for (let i = o.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [o[i], o[j]] = [o[j], o[i]];
  }
  return o;
};
const P = 8;
const shapes = {
  "replace-half": (d, k) => {
    const h = d >> 1;
    const a = range(d);
    const b = [...range(h), ...range(d - h).map((i) => d + i)];
    return [a, b].map((p) => range(k).map(() => p));
  },
  "window-slide": (d, k) => {
    const pool = d * 2, stride = Math.max(1, Math.floor(d / P));
    return range(P).map((ph) =>
      range(k).map((c) => {
        const s = (ph * stride + (c % P) * stride) % pool;
        const w = range(d).map((i) => (s + i) % pool);
        const h = d >> 1, head = w.slice(0, h), tail = w.slice(h).reverse();
        const out = [];
        for (let i = 0; i < h; i++) out.push(tail[i], head[i]);
        if (tail.length > h) out.push(tail[h]);
        return out;
      }),
    );
  },
  shuffle: (d, k) => {
    const r = prng(0x5eed + d * 31 + k);
    const perms = range(P + 3).map(() => shuffle(range(d), r));
    return range(P).map((ph) => range(k).map((c) => perms[(ph + c) % perms.length]));
  },
  "shared-shuffle": (d, k) => {
    const r = prng(0x5ead + d * 31 + k);
    return range(P).map(() => {
      const o = shuffle(range(d), r);
      return range(k).map(() => o);
    });
  },
  "hub-duplicate": (d, k) =>
    range(P).map((ph) =>
      range(k).map((c) => {
        const off = (ph * 7 + c * 3) % d;
        const p = [];
        for (let i = 0; i < d; i++) p.push((i + off) % d, d);
        return p;
      }),
    ),
  "value-sort": (d, k) => {
    const r = prng(0x50e7 + d * 31 + k);
    const orders = [range(d)];
    for (let ph = 1; ph < P; ph++) {
      const o = [...orders[ph - 1]];
      for (let e = 0; e < 2; e++) {
        const [it] = o.splice(Math.floor(r() * o.length), 1);
        o.splice(Math.floor(r() * o.length), 0, it);
      }
      orders.push(o);
    }
    return orders.map((o) => range(k).map(() => o));
  },
  stable: (d, k) => range(P).map(() => range(k).map(() => range(d))),
};

const args = process.argv.slice(2);
const opt = (n, f) => (args.includes(n) ? args[args.indexOf(n) + 1] : f);

if (args[0] === "--measure") {
  const [, bundle, shape, d, k, warmupMs, batchMs] = args;
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
  let step = 0, sink = 0;
  const run = (n) => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      rt.writeProducer(sel, ++step);
      sink += rt.readConsumer(sum);
    }
    return performance.now() - t0;
  };
  const expected = patterns.map((ph) => ph.reduce((t, pat) => t + pat.reduce((u, i) => u + i, 0), 0));
  const verify = () => {
    for (let t = 0; t < period; t++) {
      rt.writeProducer(sel, ++step);
      const got = rt.readConsumer(sum);
      if (got !== expected[step % period]) throw new Error(`wrong sum ${got} at step ${step}`);
    }
  };
  verify();
  let n = 4;
  for (let spent = run(n); spent < +warmupMs; spent += run(n)) n *= 2;
  verify();
  const per = run(n) / n;
  const batch = Math.max(4, Math.round(+batchMs / per));
  const times = [];
  for (let b = 0; b < 5; b++) times.push((run(batch) * 1e6) / batch);
  times.sort((a, b) => a - b);
  if (!Number.isFinite(sink)) throw new Error("sink");
  console.log(JSON.stringify({ ns: times[2] }));
  process.exit(0);
}

const bundles = opt("--bundles", "base,k16").split(",");
const caseRe = new RegExp(opt("--cases", "."));
const samples = +opt("--samples", 5);
const node = opt("--node", process.execPath);
const sizes = [[64, 16], [64, 128], [256, 16], [256, 128]];
const cases = Object.keys(shapes).flatMap((s) => sizes.map(([d, k]) => ({ s, d, k, id: `${s} ${d}x${k}` }))).filter((c) => caseRe.test(c.id));
const res = {};
for (let sm = 0; sm < samples; sm++) {
  for (const c of cases) {
    const order = bundles.map((_, i) => bundles[(i + sm) % bundles.length]);
    for (const b of order) {
      const big = c.d * c.k >= 256 * 128;
      const r = spawnSync(node, [import.meta.filename, "--measure", b, c.s, c.d, c.k, big ? 300 : 150, big ? 60 : 30], { encoding: "utf8" });
      if (r.status !== 0) throw new Error(r.stderr);
      ((res[c.id] ??= {})[b] ??= []).push(JSON.parse(r.stdout).ns);
    }
  }
  process.stderr.write(`sample ${sm + 1}/${samples}\n`);
}
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
const fmt = (ns) => (ns >= 1e6 ? `${(ns / 1e6).toFixed(2)} ms` : `${(ns / 1e3).toFixed(1)} µs`);
console.log(`| case | ${bundles[0]} | ${bundles.slice(1).map((b) => `${b}/${bundles[0]}`).join(" | ")} |`);
console.log(`| --- | ---: | ${bundles.slice(1).map(() => "---:").join(" | ")} |`);
for (const c of cases) {
  const r = res[c.id];
  const ratios = bundles.slice(1).map((b) => med(r[b].map((v, i) => v / r[bundles[0]][i])).toFixed(3));
  console.log(`| ${c.id} | ${fmt(med(r[bundles[0]]))} | ${ratios.join(" | ")} |`);
}
