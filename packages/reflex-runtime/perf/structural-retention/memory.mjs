// Memory cost of cross-epoch retention policies.
//
//   node perf/structural-retention/memory.mjs [--ref HEAD]
//        [--policies identity,lazy,strict] [--repeats 3]
//
// Every (scenario, policy, repeat) runs in its own `node --expose-gc` process
// on a production build (policy variants from ./variants.mjs). Scenarios:
//
//   node-size   100,000 producers and 100,000 computeds reading one producer
//               each: heap bytes per node pair after GC (the cost of a node
//               field such as lazy-identity's retainedIn).
//   dormant     2,000 live computeds each read 8 fresh producers holding a
//               1 KiB payload, then switch once to 8 others and are never
//               computed again. The test keeps only WeakRefs to the first
//               producers: after GC, heap bytes per dormant consumer and the
//               share of dropped producers still alive.
//   churn       E.retention.subtree-churn of bench/workloads.mjs: 2,000 mount,
//               update and dispose cycles, heap delta after GC (should be ~0).
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { retentionVariants } from "./variants.mjs";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};

const settle = () => {
  for (let i = 0; i < 4; i++) globalThis.gc();
  return process.memoryUsage().heapUsed;
};

if (args[0] === "--measure") {
  const [, bundle, scenario] = args;
  const rt = await import(pathToFileURL(bundle).href);
  rt.resetRuntimeContext();
  let result;
  if (scenario === "node-size") {
    const before = settle();
    const producers = new Array(100_000);
    const consumers = new Array(100_000);
    for (let i = 0; i < producers.length; i++) {
      const p = rt.createProducer(i);
      producers[i] = p;
      consumers[i] = rt.createConsumer(() => rt.readProducer(p));
      rt.readConsumer(consumers[i]);
    }
    const after = settle();
    result = { bytesPerPair: (after - before) / producers.length };
    if (producers.length + consumers.length === 0) throw new Error();
  } else if (scenario === "dormant") {
    const before = settle();
    const n = 2000;
    const refs = [];
    const consumers = new Array(n);
    const branch = rt.createProducer(0);
    for (let i = 0; i < n; i++) {
      const first = Array.from({ length: 8 }, () => {
        const p = rt.createProducer(new Array(128).fill(i));
        refs.push(new WeakRef(p));
        return p;
      });
      const second = Array.from({ length: 8 }, () =>
        rt.createProducer(new Array(128).fill(-i)),
      );
      const deps = [first, second];
      consumers[i] = rt.createConsumer(() => {
        let sum = 0;
        for (const p of deps[rt.readProducer(branch)])
          sum += rt.readProducer(p).length;
        return sum;
      });
      rt.readConsumer(consumers[i]);
      first.length = 0;
    }
    rt.writeProducer(branch, 1);
    for (const c of consumers) rt.readConsumer(c);
    // WeakRef targets stay alive until the job that created the refs ends.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Keep the dormant consumers alive; drop everything else.
    const after = settle();
    const alive = refs.filter((r) => r.deref() !== undefined).length;
    result = {
      bytesPerConsumer: (after - before) / n,
      droppedAlive: alive / refs.length,
    };
    if (consumers.length !== n) throw new Error();
  } else if (scenario === "churn") {
    const { workloads } = await import(
      pathToFileURL(path.join(packageRoot, "bench/workloads.mjs")).href
    );
    const { step } = workloads
      .find((w) => w.id === "E.retention.subtree-churn")
      .setup(rt);
    for (let i = 0; i < 100; i++) step(i);
    const before = settle();
    for (let i = 0; i < 2000; i++) step(i);
    const after = settle();
    result = { bytesPerCycle: (after - before) / 2000 };
  }
  console.log(JSON.stringify(result));
  process.exit(0);
}

const ref = option("--ref", "HEAD");
const repeats = Number(option("--repeats", 3));
const POLICY_VARIANTS = {
  retain: "retain-one-epoch",
  identity: "retain-identity",
  lazy: "lazy-identity",
  strict: "lazy-identity-strict",
  neutral: "lazy-identity-neutral",
};
const policies = [
  "cleanup",
  ...option("--policies", "identity,lazy,strict").split(","),
];
const sha = execFileSync("git", ["rev-parse", ref], {
  cwd: packageRoot,
  encoding: "utf8",
}).trim();

function build(policy) {
  const dir = path.join(
    packageRoot,
    ".cache/structural-retention/memory",
    `${sha.slice(0, 12)}-${policy}`,
  );
  const mutations =
    policy === "cleanup" ? [] : retentionVariants[POLICY_VARIANTS[policy]];
  execFileSync(
    process.execPath,
    [
      "scripts/build-baseline-oracle.mjs",
      "--commit",
      sha,
      "--production",
      "--out",
      dir,
      ...mutations.flatMap((m) => ["--mutate", m]),
    ],
    { cwd: packageRoot, stdio: "pipe" },
  );
  return path.join(dir, "runtime.mjs");
}

const bundles = Object.fromEntries(policies.map((p) => [p, build(p)]));
const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
const rows = {};
for (const scenario of ["node-size", "dormant", "churn"]) {
  for (const policy of policies) {
    const samples = [];
    for (let r = 0; r < repeats; r++) {
      const run = spawnSync(
        process.execPath,
        [
          "--expose-gc",
          import.meta.filename,
          "--measure",
          bundles[policy],
          scenario,
        ],
        { encoding: "utf8" },
      );
      if (run.status !== 0) throw new Error(run.stderr);
      samples.push(JSON.parse(run.stdout.trim().split("\n").at(-1)));
    }
    const keys = Object.keys(samples[0]);
    rows[`${scenario} / ${policy}`] = Object.fromEntries(
      keys.map((k) => [k, Number(median(samples.map((s) => s[k])).toFixed(3))]),
    );
  }
}
console.log(
  `commit ${sha.slice(0, 12)}, ${process.version}, median of ${repeats}`,
);
console.table(rows);
