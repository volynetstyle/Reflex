import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const variants = {
  lastOn:
    await import("../packages/reflex-runtime/dist/tracking-tier-profile/last-on.js"),
  lastOff:
    await import("../packages/reflex-runtime/dist/tracking-tier-profile/last-off.js"),
};

const ROUTES = [
  "trackingOneHopReorder",
  "trackingTwoHopReorder",
  "trackingInitialLastEdgeShortcut",
  "trackingLastEdgeShortcut",
  "trackingOutgoingProbeHit1",
  "trackingOutgoingProbeMiss",
  "trackingSlowPath",
];

const options = {
  runs: 20,
  warmupPasses: 32,
  measuredPasses: 256,
  dependencies: 128,
  out: "bench-results/tracking-tier-factorial/route-substitution.json",
};

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === "--runs") options.runs = Number(process.argv[++index]);
  else if (arg === "--out") options.out = process.argv[++index] ?? options.out;
  else throw new Error(`Unknown argument: ${arg}`);
}

function range(length, offset = 0) {
  return Array.from({ length }, (_, index) => index + offset);
}

function rotate(count, offset) {
  const normalized = ((offset % count) + count) % count;
  return Array.from(
    { length: count },
    (_, index) => (index + normalized) % count,
  );
}

function patternFor(scenario, pass, count) {
  if (scenario === "rotate-left") return rotate(count, pass);
  if (scenario === "rotate-right") return rotate(count, -pass);
  if (scenario === "displacement-two") return rotate(count, pass * 2);
  const pattern = range(count);
  if (scenario === "conditional-branches") {
    if (pass % 16 === 0) return range(count, count);
    if (pass % 16 === 1 || pass % 5 !== 0) return pattern;
    const first = Math.abs(Math.imul(pass, 17)) % (count - 1);
    [pattern[first], pattern[first + 1]] = [pattern[first + 1], pattern[first]];
    return pattern;
  }
  if (pass % 8 === 0) {
    const prefix = Math.floor(count * 0.75);
    return [...range(prefix), ...range(count - prefix, prefix).reverse()];
  }
  if (pass % 4 === 0) {
    const first = Math.abs(Math.imul(pass, 17)) % (count - 1);
    [pattern[first], pattern[first + 1]] = [pattern[first + 1], pattern[first]];
  }
  return pattern;
}

function runProfile(runtime, scenario) {
  const phase = runtime.createProducer(-1);
  const sourceCount =
    scenario === "conditional-branches"
      ? options.dependencies * 2
      : options.dependencies;
  const sources = Array.from({ length: sourceCount }, (_, index) =>
    runtime.createProducer(index + 1),
  );
  const consumer = runtime.createConsumer(() => {
    const pass = runtime.readProducer(phase);
    let total = 0;
    for (const index of patternFor(scenario, pass, options.dependencies))
      total += runtime.readProducer(sources[index]);
    return total;
  });
  runtime.readConsumerEager(consumer);
  const step = (pass) => {
    runtime.writeProducer(phase, pass);
    return runtime.readConsumerLazy.call(consumer);
  };
  for (let pass = 0; pass < options.warmupPasses; pass += 1) step(pass);
  const { value, counters } = runtime.profileRuntime(() => {
    let sink = 0;
    for (let pass = 0; pass < options.measuredPasses; pass += 1)
      sink += step(options.warmupPasses + pass);
    return sink;
  });
  if (!Number.isFinite(value)) throw new Error("Non-finite profiling sink");
  return {
    trackingResolveCalls: counters.trackingResolveCalls,
    routes: Object.fromEntries(ROUTES.map((route) => [route, counters[route]])),
  };
}

const scenarios = [
  "rotate-left",
  "rotate-right",
  "displacement-two",
  "conditional-branches",
  "mixed-app-churn",
].map((id) => {
  const runs = Object.fromEntries(
    Object.entries(variants).map(([variant, runtime]) => [
      variant,
      Array.from({ length: options.runs }, () => runProfile(runtime, id)),
    ]),
  );
  const totals = Object.fromEntries(
    Object.keys(variants).map((variant) => [
      variant,
      Object.fromEntries(
        ROUTES.map((route) => [
          route,
          runs[variant].reduce((total, run) => total + run.routes[route], 0),
        ]),
      ),
    ]),
  );
  return { id, runs, totals };
});

const report = {
  schemaVersion: 1,
  suite: "tracking-tier-route-substitution",
  generatedAt: new Date().toISOString(),
  config: options,
  note: "trackingSlowPath counts delegation; outgoingProbeHit1 identifies O(1) producer-side resolution inside it",
  scenarios,
};
const output = resolve(options.out);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);

for (const scenario of scenarios) {
  console.log(scenario.id, {
    lastOn: scenario.totals.lastOn,
    lastOff: scenario.totals.lastOff,
  });
}
console.log(`Tracking route substitution report: ${output}`);
