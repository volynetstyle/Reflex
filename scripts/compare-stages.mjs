import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

const [before = "baseline", after = "candidate"] = process.argv.slice(2);
const range = (length) => Array.from({ length }, (_, i) => i);
const node = (r, state = 0, compute = undefined) =>
  new r.ReactiveNode(undefined, compute, state);
function push(r, width, kind = "clean") {
  const source = node(r),
    nodes = [],
    watchers = kind === "watchers";
  for (let i = 0; i < width; i++) {
    const n = node(r, watchers ? r.Watcher : 0);
    nodes.push(n);
    r.linkEdge(source, n);
  }
  if (kind === "dirty") {
    r.propagate(source.firstOut);
    return () => {
      r.propagate(source.firstOut);
      return nodes[0].state;
    };
  }
  let notifications = 0;
  if (kind === "hooks") {
    for (const n of nodes) n.state = r.Watcher;
    r.configureRuntimeContext({
      hooks: {
        onNodeInvalidated() {
          notifications++;
        },
      },
    });
  }
  return () => {
    for (const n of nodes)
      n.state = watchers || kind === "hooks" ? r.Watcher : 0;
    r.propagate(source.firstOut);
    return nodes[0].state + notifications;
  };
}
function pushTopology(r, kind) {
  const source = node(r),
    nodes = [];
  if (kind === "chain") {
    let previous = source;
    for (let i = 0; i < 512; i++) {
      const n = node(r);
      nodes.push(n);
      r.linkEdge(previous, n);
      previous = n;
    }
  } else if (kind === "diamond") {
    const join = node(r);
    nodes.push(join);
    for (let i = 0; i < 128; i++) {
      const n = node(r);
      nodes.push(n);
      r.linkEdge(source, n);
      r.linkEdge(n, join);
    }
  } else {
    let parents = [source];
    for (const width of [8, 4, 4]) {
      const children = [];
      for (const parent of parents)
        for (let i = 0; i < width; i++) {
          const child = node(r);
          nodes.push(child);
          children.push(child);
          r.linkEdge(parent, child);
        }
      parents = children;
    }
  }
  return () => {
    for (const n of nodes) n.state = 0;
    r.propagate(source.firstOut);
    return nodes.at(-1).state;
  };
}
function computing(r, afterCursor) {
  const source = node(r),
    consumers = [];
  for (let i = 0; i < 16; i++) {
    const target = node(r, r.Computing);
    consumers.push(target);
    for (let j = 0; j < 64; j++) {
      const edge = r.linkEdge(
        j === (afterCursor ? 63 : 31) ? source : node(r),
        target,
      );
      if (j === 47) target.tailIn = edge;
    }
  }
  return () => {
    for (const n of consumers) n.state = r.Computing;
    r.propagate(source.firstOut);
    return consumers[0].state;
  };
}
function once(r, skip) {
  const source = node(r),
    nodes = range(128).map(() => node(r));
  for (const n of nodes) r.linkEdge(source, n);
  const skipped = skip ? source.firstOut : null;
  return () => {
    for (const n of nodes) n.state = r.Unknown;
    if (skip) r.push_iterator_once_skipping(source.firstOut, skipped);
    else r.push_iterator_once(source.firstOut);
    return nodes.at(-1).state;
  };
}
function cleanPull(r, width) {
  const target = node(r);
  for (let i = 0; i < width; i++) r.linkEdge(node(r), target);
  return () => {
    target.state = r.Unknown;
    return Number(r.pull_iterator(target, target.firstIn));
  };
}
function chain(r, depth, stable) {
  const source = r.createProducer(0);
  let parent = source;
  for (let i = 0; i < depth; i++) {
    const dep = parent;
    parent = r.createConsumer(() => {
      const value = i === 0 ? r.readProducer(dep) : r.readConsumer(dep);
      return stable && i === 0 ? value % 2 : value + 1;
    });
    r.readConsumer(parent);
  }
  return (pass) => {
    r.writeProducer(source, stable ? pass * 2 : pass);
    return r.readConsumer(parent);
  };
}
function diamond(r, width, stable) {
  const source = r.createProducer(0);
  const leaves = range(width).map((i) =>
    r.createConsumer(() => {
      const value = r.readProducer(source);
      return stable ? value % 2 : value + i;
    }),
  );
  const root = r.createConsumer(() => {
    let total = 0;
    for (const leaf of leaves) total += r.readConsumer(leaf);
    return total;
  });
  r.readConsumer(root);
  return (pass) => {
    r.writeProducer(source, stable ? pass * 2 : pass);
    return r.readConsumer(root);
  };
}
function advancing(r, width, unchanged, skip) {
  let value = 0;
  const source = r.createConsumer(() => value);
  const subscribers = range(width).map(() => node(r));
  for (const n of subscribers) r.linkEdge(source, n);
  r.advance(source);
  const skipEdge = skip ? source.firstOut : null;
  return (pass) => {
    value = unchanged ? 0 : pass;
    for (const n of subscribers) n.state = 0;
    return Number(r.advance(source, skipEdge));
  };
}
const scenarios = {
  "push-clean-16": (r) => push(r, 16),
  "push-clean-128": (r) => push(r, 128),
  "push-clean-1024": (r) => push(r, 1024),
  "push-already-dirty": (r) => push(r, 128, "dirty"),
  "push-watchers-no-hook": (r) => push(r, 128, "watchers"),
  "push-watchers-hook": (r) => push(r, 128, "hooks"),
  "push-chain-512": (r) => pushTopology(r, "chain"),
  "push-branching": (r) => pushTopology(r, "tree"),
  "push-diamond": (r) => pushTopology(r, "diamond"),
  "push-computing-prefix": (r) => computing(r, false),
  "push-computing-suffix": (r) => computing(r, true),
  "push-once": (r) => once(r, false),
  "push-once-skipping": (r) => once(r, true),
  "pull-clean-16": (r) => cleanPull(r, 16),
  "pull-clean-128": (r) => cleanPull(r, 128),
  "pull-clean-1024": (r) => cleanPull(r, 1024),
  "chain-changed-32": (r) => chain(r, 32, false),
  "chain-changed-256": (r) => chain(r, 256, false),
  "chain-stable-256": (r) => chain(r, 256, true),
  "diamond-changed-128": (r) => diamond(r, 128, false),
  "diamond-stable-128": (r) => diamond(r, 128, true),
  "advance-unobserved": (r) => advancing(r, 0, false, false),
  "advance-unchanged": (r) => advancing(r, 1, true, false),
  "advance-one-parent": (r) => advancing(r, 1, false, true),
  "advance-side-fanout": (r) => advancing(r, 16, false, true),
};
const iterations = 20000,
  warmup = 10000,
  samples = 9;
if (before === "--measure") {
  const r = await import(
    pathToFileURL(resolve("temp/stages", after, "prod.mjs")).href
  );
  const result = {};
  let sink = 0;
  for (const [name, setup] of Object.entries(scenarios)) {
    if (process.argv[4] && name !== process.argv[4]) continue;
    r.resetRuntimeContext();
    const step = setup(r);
    for (let i = 0; i < warmup; i++) sink += step(i);
    const start = performance.now();
    for (let i = 0; i < iterations; i++) sink += step(i + warmup);
    result[name] = ((performance.now() - start) * 1e6) / iterations;
  }
  if (!Number.isFinite(sink)) throw new Error("Invalid benchmark sink");
  console.log(JSON.stringify(result));
  process.exit(0);
}
const median = (values) =>
  [...values].sort((a, b) => a - b)[values.length >> 1];
const nodeFlags = ["--no-concurrent-recompilation"];
const report = {
  node: process.version,
  cpu: cpus()[0]?.model,
  before,
  after,
  iterations,
  warmup,
  samples,
  nodeFlags,
  isolatedScenarios: true,
  scenarios: {},
};
for (const name of Object.keys(scenarios)) {
  const raw = [[], []];
  for (let sample = 0; sample < samples; sample++) {
    for (const index of sample % 2 === 0 ? [0, 1] : [1, 0]) {
      const result = JSON.parse(
        execFileSync(
          process.execPath,
          [
            ...nodeFlags,
            fileURLToPath(import.meta.url),
            "--measure",
            [before, after][index],
            name,
          ],
          { encoding: "utf8", windowsHide: true },
        ),
      );
      raw[index].push(result[name]);
    }
  }
  const baseline = median(raw[0]),
    candidate = median(raw[1]);
  report.scenarios[name] = {
    baselineNs: baseline,
    candidateNs: candidate,
    speedup: baseline / candidate,
    raw,
  };
  console.log(
    `${name.padEnd(25)} ${baseline.toFixed(0).padStart(8)} -> ${candidate.toFixed(0).padStart(8)} ns/pass  ${(baseline / candidate).toFixed(2)}x`,
  );
}
writeFileSync(
  resolve("temp/stages", `${before}-vs-${after}.json`),
  JSON.stringify(report, null, 2) + "\n",
);
