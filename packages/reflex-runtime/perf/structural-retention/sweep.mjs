// Cross-epoch retention sweep: when does keeping a dependency edge through an
// inactive epoch beat unlinking it at cleanup and relinking it later?
//
//   node perf/structural-retention/sweep.mjs [--ref HEAD] [--rows 64]
//        [--samples 5] [--warmup-ms 150] [--batch-ms 30] [--out <file.json>]
//
// Policies: `cleanup` (the ref as built), `retain` (retain-one-epoch of
// ./variants.mjs: design (a), a retained edge keeps full causal authority for
// one epoch) and `identity` (retain-identity: design (b), the edge object
// survives one epoch outside both lists, without authority).
//
// Workload, per row: a consumer C (computed, or watcher) reads `tick`, `show`
// and, while show = 1, its own producer `item` (which has one other
// subscriber, so its outgoing list is not empty). One cycle:
//   present   show = 1, settle: C reads item (first link, or resurrection)
//   absent 1  show = 0, settle: C drops item; cleanup unlinks or retains it
//   writes    w times: write item, settle
//   epochs    gap - 1 times: write tick, settle (C runs without item)
// then the next cycle's present step brings item back after `gap` epochs.
// gap = never: each cycle reads a different item of a pool of 8, so a
// dropped dependency does not return within 40 epochs. Settle = read every C
// (computed) or drain the host queue (watcher).
//
// Counts per row and cycle come from a PROFILE build of each policy (links:
// link-new, cursor append and initial create; unlinks: cleanup drops; lookup
// links: locate steps) and from the callbacks (executions, executions while
// item was absent, host deliveries). Time per row and cycle comes from
// production builds, one process per (sample, cell, policy), median of five
// batches, as in perf/tracking-ladder/time.mjs.
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { workloads as benchWorkloads } from "../../bench/workloads.mjs";
import { retentionVariants } from "./variants.mjs";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};

function workload(rt, { kind, w, gap, rows }, counters) {
  if (kind === "bench") {
    // A benchmark workload of bench/workloads.mjs, one step per cycle.
    const { step } = benchWorkloads.find((b) => b.id === gap).setup(rt);
    let index = 0;
    return () => step(index++);
  }
  const queue = [];
  rt.resetRuntimeContext();
  rt.configureRuntimeContext({
    hooks: {
      onNodeInvalidated(node) {
        counters.deliveries++;
        queue.push(node);
      },
    },
  });
  const flush = () => {
    for (let i = 0; i < queue.length; i++) rt.runWatcher(queue[i]);
    queue.length = 0;
  };
  const show = rt.createProducer(1);
  const tick = rt.createProducer(0);
  const pool = gap === "never" ? 8 : 1;
  const consumers = [];
  const rowState = [];
  let absent = false;
  for (let r = 0; r < rows; r++) {
    const items = Array.from({ length: pool }, (_, k) =>
      rt.createProducer(r * 100 + k),
    );
    const others = items.map((item) =>
      rt.createConsumer(() => rt.readProducer(item)),
    );
    for (const other of others) rt.readConsumer(other);
    const state = { items, current: items[0] };
    rowState.push(state);
    const body = () => {
      counters.executions++;
      if (absent) counters.whileAbsent++;
      let v = rt.readProducer(tick);
      if (rt.readProducer(show) === 1) v += rt.readProducer(state.current);
      return v;
    };
    consumers.push(
      kind === "computed"
        ? rt.createConsumer(body)
        : rt.createWatcher(() => void body()),
    );
  }
  const settle =
    kind === "computed"
      ? () => {
          for (const c of consumers) rt.readConsumer(c);
        }
      : flush;
  if (kind === "watcher") for (const c of consumers) rt.runWatcher(c);
  else settle();
  let showValue = 1;
  let tickValue = 0;
  let writeValue = 1e6;
  const epochs = gap === "never" ? 3 : gap - 1;
  let cycle = 0;
  return () => {
    for (const state of rowState)
      state.current = state.items[cycle % state.items.length];
    cycle++;
    rt.writeProducer(show, (showValue = 1));
    settle();
    rt.writeProducer(show, (showValue = 0));
    settle();
    absent = true;
    for (let k = 0; k < w; k++) {
      writeValue++;
      for (const state of rowState) rt.writeProducer(state.current, writeValue);
      settle();
    }
    for (let k = 0; k < epochs; k++) {
      rt.writeProducer(tick, ++tickValue);
      settle();
    }
    absent = false;
    return showValue + tickValue;
  };
}

const cells = [];
if (!args.includes("--no-synthetic"))
  for (const kind of ["computed", "watcher"])
    for (const gap of [1, 2, 4, "never"])
      for (const w of [0, 1, 2, 4, 8, 16]) cells.push({ kind, gap, w });
// --bench <ids>: benchmark workloads as extra cells (kind "bench", gap = id).
for (const id of (args.includes("--bench")
  ? args[args.indexOf("--bench") + 1]
  : ""
)
  .split(",")
  .filter(Boolean))
  cells.push({ kind: "bench", gap: id, w: 0 });
const rowsOf = (c, rows) => (c.kind === "bench" ? 1 : rows);

if (args[0] === "--measure") {
  const [, bundle, encoded] = args;
  const c = JSON.parse(encoded);
  const rt = await import(pathToFileURL(bundle).href);
  const counters = { executions: 0, whileAbsent: 0, deliveries: 0 };
  const step = workload(rt, c, counters);
  let sink = 0;
  const run = (n) => {
    const start = performance.now();
    for (let i = 0; i < n; i++) sink += step();
    return performance.now() - start;
  };
  let n = 8;
  for (let spent = run(n); spent < c.warmupMs; spent += run(n)) n *= 2;
  const perStep = run(n) / n;
  const batch = Math.max(4, Math.round(c.batchMs / perStep));
  const times = [];
  for (let b = 0; b < 5; b++) times.push((run(batch) * 1e6) / batch / c.rows);
  if (!Number.isFinite(sink)) throw new Error("invalid result");
  times.sort((a, b) => a - b);
  console.log(JSON.stringify({ ns: times[2] }));
  process.exit(0);
}

const ref = option("--ref", "HEAD");
const rows = Number(option("--rows", 64));
const samples = Number(option("--samples", 5));
const warmupMs = Number(option("--warmup-ms", 150));
const batchMs = Number(option("--batch-ms", 30));
const out = option("--out");
const sha = execFileSync("git", ["rev-parse", ref], {
  cwd: packageRoot,
  encoding: "utf8",
}).trim();

function build(policy, mode) {
  const dir = path.join(
    packageRoot,
    ".cache/structural-retention/sweep",
    `${sha.slice(0, 12)}-${policy}-${mode}`,
  );
  const mutations =
    policy === "cleanup" ? [] : retentionVariants[POLICY_VARIANTS[policy]];
  execFileSync(
    process.execPath,
    [
      "scripts/build-baseline-oracle.mjs",
      "--commit",
      sha,
      mode === "profile" ? "--profile" : "--production",
      "--out",
      dir,
      ...mutations.flatMap((m) => ["--mutate", m]),
    ],
    { cwd: packageRoot, stdio: "pipe" },
  );
  return path.join(dir, "runtime.mjs");
}

const POLICY_VARIANTS = {
  retain: "retain-one-epoch",
  identity: "retain-identity",
  lazy: "lazy-identity",
  strict: "lazy-identity-strict",
  neutral: "lazy-identity-neutral",
};
const policies = [
  "cleanup",
  ...option("--policies", "retain,identity,lazy,strict").split(","),
];
const LINKS = new Set([
  "projection.semantic.tracking.suffix.link-new",
  "projection.semantic.tracking.cursor.append",
  "projection.semantic.tracking.initial.create",
]);

// Counts: PROFILE builds, a fixed number of cycles after one warm cycle.
const counts = {};
for (const policy of policies) {
  const rt = await import(pathToFileURL(build(policy, "profile")).href);
  for (const c of cells) {
    const tally = { links: 0, unlinks: 0, lookupLinks: 0 };
    globalThis.__srRetained = 0;
    globalThis.__srReattached = 0;
    globalThis.__srReactivated = 0;
    const counters = { executions: 0, whileAbsent: 0, deliveries: 0 };
    rt.setRuntimeProjectionObserver(undefined);
    const step = workload(rt, { ...c, rows: rowsOf(c, rows) }, counters);
    step();
    for (const key of Object.keys(counters)) counters[key] = 0;
    globalThis.__srRetained = 0;
    globalThis.__srReattached = 0;
    globalThis.__srReactivated = 0;
    rt.setRuntimeProjectionObserver(({ id }) => {
      if (LINKS.has(id)) tally.links++;
      else if (id === "projection.semantic.cleanup.edge.drop") tally.unlinks++;
      else if (id === "projection.semantic.tracking.locate.step")
        tally.lookupLinks++;
    });
    const cycles = 16;
    for (let i = 0; i < cycles; i++) step();
    rt.setRuntimeProjectionObserver(undefined);
    const retained = globalThis.__srRetained;
    const reattached = globalThis.__srReattached;
    const reactivated = globalThis.__srReactivated;
    const per = (n) => Number((n / cycles / rowsOf(c, rows)).toFixed(3));
    counts[`${policy}|${c.kind}|${c.gap}|${c.w}`] = {
      links: per(tally.links),
      unlinks: per(tally.unlinks),
      lookupLinks: per(tally.lookupLinks),
      executions: per(counters.executions),
      whileAbsent: per(counters.whileAbsent),
      deliveries: per(counters.deliveries),
      retained: per(retained),
      reattached: per(reattached),
      reactivated: per(reactivated),
    };
  }
}

// Time: production builds, one process per (sample, cell, policy).
const bundles = Object.fromEntries(
  policies.map((policy) => [policy, build(policy, "production")]),
);
const times = {};
for (let s = 0; s < samples; s++) {
  process.stderr.write(`sample ${s + 1}/${samples}\n`);
  for (const c of cells) {
    const order = policies.map((_, i) => policies[(i + s) % policies.length]);
    for (const policy of order) {
      const result = spawnSync(
        process.execPath,
        [
          import.meta.filename,
          "--measure",
          bundles[policy],
          JSON.stringify({ ...c, rows: rowsOf(c, rows), warmupMs, batchMs }),
        ],
        { encoding: "utf8" },
      );
      if (result.status !== 0) throw new Error(result.stderr);
      const key = `${c.kind}|${c.gap}|${c.w}`;
      ((times[key] ??= {})[policy] ??= []).push(
        JSON.parse(result.stdout.trim().split("\n").at(-1)).ns,
      );
    }
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
};
const rowsOut = [];
const others = policies.slice(1);
const initials = (ps) => ps.map((p) => p[0]).join("/");
console.log(
  `| consumer | gap | w | cleanup ns | ${others.map((p) => `${p}/cleanup`).join(" | ")} | links ${initials(policies)} | executions ${initials(policies)} | reused ${initials(others)} |`,
);
console.log(
  `| --- | ---: | ---: | ---: | ${others.map(() => "---:").join(" | ")} | ---: | ---: | ---: |`,
);
for (const c of cells) {
  const key = `${c.kind}|${c.gap}|${c.w}`;
  const t = times[key];
  const ratioOf = (policy) => {
    const ratios = t.cleanup.map((x, i) => t[policy][i] / x);
    return {
      median: median(ratios),
      range: [Math.min(...ratios), Math.max(...ratios)],
    };
  };
  const row = { ...c, cleanupNs: median(t.cleanup), ratios: {}, counts: {} };
  for (const p of policies) row.counts[p] = counts[`${p}|${key}`];
  for (const p of others) row.ratios[p] = ratioOf(p);
  rowsOut.push(row);
  const list = (k, ps) => ps.map((p) => row.counts[p][k]).join("/");
  const reused = others
    .map((p) => row.counts[p].reactivated || row.counts[p].reattached || 0)
    .join("/");
  const ratio = (r) =>
    `${r.median.toFixed(3)} (${r.range[0].toFixed(2)}–${r.range[1].toFixed(2)})`;
  console.log(
    `| ${c.kind} | ${c.gap} | ${c.w} | ${row.cleanupNs.toFixed(0)} | ${others.map((p) => ratio(row.ratios[p])).join(" | ")} | ${list("links", policies)} | ${list("executions", policies)} | ${reused} |`,
  );
}
if (out !== undefined)
  writeFileSync(
    out,
    `${JSON.stringify({ commit: sha, rows, samples, node: process.version, cells: rowsOut }, null, 1)}\n`,
  );
