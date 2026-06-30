import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const VARIANTS = Array.from({ length: 8 }, (_, bits) => ({
  id: `o${Number((bits & 4) !== 0)}-t${Number((bits & 2) !== 0)}-l${Number((bits & 1) !== 0)}`,
  oneHop: (bits & 4) !== 0,
  twoHop: (bits & 2) !== 0,
  lastEdge: (bits & 1) !== 0,
}));

for (const variant of VARIANTS) {
  variant.runtime = await import(
    `../packages/reflex-runtime/dist/tracking-factorial/${variant.id}.js`
  );
}

const SCENARIOS = [
  "rotate-left",
  "rotate-right",
  "displacement-two",
  "conditional-branches",
  "mixed-app-churn",
];

const defaults = {
  runs: 60,
  warmupPasses: 32,
  measuredPasses: 256,
  dependencies: 128,
  bootstrapSamples: 10_000,
  seed: 0x5eed1234,
  out: "bench-results/tracking-tier-factorial/latest.json",
};

function parseArgs() {
  const options = { ...defaults };
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--runs") options.runs = positiveInteger(args[++index], arg);
    else if (arg === "--warmup-passes")
      options.warmupPasses = positiveInteger(args[++index], arg);
    else if (arg === "--measured-passes")
      options.measuredPasses = positiveInteger(args[++index], arg);
    else if (arg === "--dependencies")
      options.dependencies = positiveInteger(args[++index], arg);
    else if (arg === "--bootstrap-samples")
      options.bootstrapSamples = positiveInteger(args[++index], arg);
    else if (arg === "--out") options.out = args[++index] ?? options.out;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.dependencies < 4)
    throw new Error("--dependencies must be at least 4");
  return options;
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
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
  } else {
    if (pass % 8 === 0) {
      const prefix = Math.floor(count * 0.75);
      return [...range(prefix), ...range(count - prefix, prefix).reverse()];
    }
    if (pass % 4 !== 0) return pattern;
  }

  const first = Math.abs(Math.imul(pass, 17)) % (count - 1);
  [pattern[first], pattern[first + 1]] = [pattern[first + 1], pattern[first]];
  return pattern;
}

function measure(runtime, scenario, options) {
  const sourceCount =
    scenario === "conditional-branches"
      ? options.dependencies * 2
      : options.dependencies;
  const phase = runtime.createProducer(-1);
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

  let sink = 0;
  const start = performance.now();
  for (let pass = 0; pass < options.measuredPasses; pass += 1)
    sink += step(options.warmupPasses + pass);
  const elapsed = performance.now() - start;
  if (!Number.isFinite(sink)) throw new Error("Non-finite benchmark sink");
  return elapsed / options.measuredPasses;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function bootstrapMedianCi(values, sampleCount, seed) {
  const random = mulberry32(seed);
  const estimates = new Array(sampleCount);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const resampled = Array.from(
      { length: values.length },
      () => values[Math.floor(random() * values.length)],
    );
    estimates[sample] = median(resampled);
  }
  estimates.sort((left, right) => left - right);
  return [
    estimates[Math.floor(sampleCount * 0.025)],
    estimates[Math.floor(sampleCount * 0.975)],
  ];
}

function variantOrder(run) {
  const offset = (run * 3) % VARIANTS.length;
  const ordered = [...VARIANTS.slice(offset), ...VARIANTS.slice(0, offset)];
  return run % 2 === 0 ? ordered : ordered.reverse();
}

function marginalContrasts(samples, tier) {
  const contrasts = [];
  for (let run = 0; run < samples[VARIANTS[0].id].length; run += 1) {
    for (const enabled of VARIANTS.filter((variant) => variant[tier])) {
      const disabled = VARIANTS.find(
        (variant) =>
          !variant[tier] &&
          variant.oneHop === (tier === "oneHop" ? false : enabled.oneHop) &&
          variant.twoHop === (tier === "twoHop" ? false : enabled.twoHop) &&
          variant.lastEdge === (tier === "lastEdge" ? false : enabled.lastEdge),
      );
      contrasts.push(samples[disabled.id][run] / samples[enabled.id][run] - 1);
    }
  }
  return contrasts;
}

const FACTORIAL_TERMS = {
  oneHop: ["oneHop"],
  twoHop: ["twoHop"],
  lastEdge: ["lastEdge"],
  oneHopByTwoHop: ["oneHop", "twoHop"],
  oneHopByLastEdge: ["oneHop", "lastEdge"],
  twoHopByLastEdge: ["twoHop", "lastEdge"],
  oneHopByTwoHopByLastEdge: ["oneHop", "twoHop", "lastEdge"],
};

function factorialEffectsByRun(samples, factors) {
  const effects = [];
  for (let run = 0; run < samples[VARIANTS[0].id].length; run += 1) {
    let contrast = 0;
    for (const variant of VARIANTS) {
      const sign = factors.reduce(
        (product, factor) => product * (variant[factor] ? 1 : -1),
        1,
      );
      contrast += sign * Math.log(samples[variant.id][run]);
    }
    // Classical 2^3 effect: mean response at positive contrast minus mean at
    // negative contrast. Log response makes the result a multiplicative ratio.
    effects.push(Math.exp(contrast / 4) - 1);
  }
  return effects;
}

function hash(text) {
  let value = 2166136261;
  for (const char of text)
    value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function getCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

const options = parseArgs();
const scenarios = SCENARIOS.map((scenario, scenarioIndex) => {
  const samples = Object.fromEntries(
    VARIANTS.map((variant) => [variant.id, []]),
  );
  for (let run = 0; run < options.runs; run += 1) {
    for (const variant of variantOrder(run + scenarioIndex)) {
      samples[variant.id].push(measure(variant.runtime, scenario, options));
    }
  }

  const medians = Object.fromEntries(
    VARIANTS.map((variant) => [variant.id, median(samples[variant.id])]),
  );
  const baseline = medians["o1-t1-l1"];
  const variants = Object.fromEntries(
    VARIANTS.map((variant) => [
      variant.id,
      {
        flags: {
          oneHop: variant.oneHop,
          twoHop: variant.twoHop,
          lastEdge: variant.lastEdge,
        },
        medianMsPerPass: medians[variant.id],
        relativeToBaseline: medians[variant.id] / baseline - 1,
      },
    ]),
  );
  const marginalEffects = Object.fromEntries(
    ["oneHop", "twoHop", "lastEdge"].map((tier) => {
      const contrasts = marginalContrasts(samples, tier);
      return [
        tier,
        {
          definition:
            "disabled/enabled - 1; positive means the tier improves latency",
          median: median(contrasts),
          bootstrap95Ci: bootstrapMedianCi(
            contrasts,
            options.bootstrapSamples,
            options.seed ^ hash(`${scenario}:${tier}`),
          ),
        },
      ];
    }),
  );
  const factorialEffects = Object.fromEntries(
    Object.entries(FACTORIAL_TERMS).map(([term, factors]) => {
      const effects = factorialEffectsByRun(samples, factors);
      return [
        term,
        {
          factors,
          definition:
            "classical factorial effect on log latency; negative means the enabled factor/interaction reduces latency",
          median: median(effects),
          bootstrap95Ci: bootstrapMedianCi(
            effects,
            options.bootstrapSamples,
            options.seed ^ hash(`${scenario}:${term}:factorial`),
          ),
        },
      ];
    }),
  );
  return {
    id: scenario,
    unit: "ms/pass",
    samples,
    variants,
    marginalEffects,
    factorialEffects,
  };
});

const report = {
  schemaVersion: 1,
  suite: "tracking-tier-factorial",
  generatedAt: new Date().toISOString(),
  commit: getCommit(),
  cpu: cpus()[0]?.model ?? null,
  config: options,
  variants: VARIANTS.map(({ runtime, ...variant }) => variant),
  scenarios,
};
const output = resolve(options.out);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);

for (const scenario of scenarios) {
  const effects = scenario.marginalEffects;
  console.log(
    `${scenario.id}: one=${(effects.oneHop.median * 100).toFixed(2)}% two=${(effects.twoHop.median * 100).toFixed(2)}% last=${(effects.lastEdge.median * 100).toFixed(2)}%`,
  );
}
console.log(`Tracking tier factorial report: ${output}`);
