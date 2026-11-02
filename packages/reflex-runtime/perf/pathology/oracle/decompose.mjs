// Where the tape's own work goes, per user step (counts, not time):
// T_tape = acquire (strikes, arms) + cover (edges marked) + revoke and
// reclaim (edges unmarked) + fallback (exact searches the tape did not
// spare). On the evidence-instrumented bundle of instrument.mjs.
//   node perf/pathology/oracle/decompose.mjs <instrumented bundle dir>
import path from "node:path";
import { pathToFileURL } from "node:url";

import { cases as clinical } from "../cases.mjs";
import { cases as consequences } from "../consequences.mjs";
import { cases as discovery } from "../discovery.mjs";

const rt = await import(
  pathToFileURL(path.resolve(process.argv[2], "runtime.mjs")).href
);

const tally = new Map();
const inLength = (c) => {
  let k = 0;
  for (let e = c.firstIn; e !== null; e = e.nextIn) k++;
  return k;
};
let recording = false;
globalThis.__ev = (kind, consumer, value, producer) => {
  if (!recording) return;
  const add = (k, v = 1) => tally.set(k, (tally.get(k) ?? 0) + v);
  // A "maybe" on a producer without an edge to the owner: a stale bit or an
  // aliased generation tag.
  if (kind === "exact-fallback" && producer !== undefined) {
    let edge = false;
    for (let e = producer.firstOut; e !== null; e = e.nextOut)
      if (e.to === consumer) edge = true;
    if (!edge) add("stale");
  }
  if (kind === "cover") add("cover", value);
  else if (kind === "revoke" || kind === "reclaim") add("revoke", value);
  else if (kind === "certify-after-cover") add(value === 1 ? "cert" : "fallback");
  else if (kind === "cert-absent") add("cert");
  else if (kind === "exact-fallback" || kind === "uncovered-fallback" || kind === "busy-fallback")
    add("fallback");
  else if (kind === "arm") add("arm");
  else if (kind === "prepare" || kind === "prepare-uncovered") {
    // The eager tape (dev, stage 1) covers the whole list when it prepares.
    add("arm");
    add("cover", inLength(consumer));
  } else if (kind === "release") add("revoke", inLength(consumer));
  else if (kind === "strike") add("strike");
};

const range = (k) => Array.from({ length: k }, (_, i) => i);
function permutation(k, seed) {
  const order = range(k);
  let s = seed >>> 0 || 1;
  for (let i = k - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// K+1 owners recycling lanes: five wide consumers re-track the same
// producers in fresh orders, one after another.
const laneChurn = {
  build(rt, n) {
    const ps = range(n).map((i) => rt.createProducer(i));
    const tick = rt.createProducer(0);
    const perms = range(8).map((k) => permutation(n, 3 + k));
    const cs = range(5).map((j) =>
      rt.createConsumer(() => {
        const order = perms[(rt.readProducer(tick) + j) & 7];
        let t = 0;
        for (let i = 0; i < n; i++) t += rt.readProducer(ps[order[i]]);
        return t;
      }),
    );
    for (const c of cs) rt.readConsumer(c);
    let step = 0;
    return {
      op() {
        rt.writeProducer(tick, ++step);
        let t = 0;
        for (const c of cs) t += rt.readConsumer(c);
        return t;
      },
      reads: 5 * (n + 1),
    };
  },
};

const plan = [
  ["many short-lived wide consumers", consequences["list-mount"], 256],
  ["many short-lived wide consumers", clinical["mount-dispose-wide"], 4096],
  ["mount over popular producers", consequences["mount-fanout"], 256],
  ["nested mount", consequences["nested-mount"], 4096],
  ["suspend and resume", discovery["suspend-resume"], 4096],
  ["branch toggle", discovery["branch-toggle-wide"], 4096],
  ["wide -> narrow -> wide", clinical["wide-narrow"], 16384],
  ["replace half", clinical["replace-half"], 16384],
  ["lane churn, K+1 owners", laneChurn, 2048],
  ["shared thrash, 32 owners", clinical["shared-thrash"], 1024],
  ["shuffle over clean computeds", discovery["shuffle-over-clean"], 1024],
  ["shuffle over dirty computeds", discovery["shuffle-over-dirty"], 1024],
];

const cols = ["strike", "arm", "cover", "revoke", "fallback", "stale", "cert"];
console.log(`| workload | n | reads | ${cols.join(" | ")} | (cover+revoke)/reads |`);
console.log(`|---|---:|---:|${cols.map(() => "---:").join("|")}|---:|`);
for (const [label, spec, n] of plan) {
  const { op, reads } = spec.build(rt, n);
  op();
  op();
  tally.clear();
  recording = true;
  const STEPS = 3;
  for (let i = 0; i < STEPS; i++) op();
  recording = false;
  const per = (k) => (tally.get(k) ?? 0) / STEPS;
  const fmt = (x) => (x >= 100 ? x.toFixed(0) : x.toFixed(1));
  const work = (per("cover") + per("revoke")) / reads;
  console.log(
    `| ${label} | ${n} | ${reads} | ${cols.map((k) => fmt(per(k))).join(" | ")} | ${work.toFixed(3)} |`,
  );
}
