import { performance } from "node:perf_hooks";
import { hrtime } from "node:process";
import {
  batch,
  computed,
  createRuntime,
  effect,
  event,
  memo,
  signal,
} from "../dist/esm/index.js";

const DEFAULT_ITERATIONS = 100_000;
const DEFAULT_WARMUP = 40_000;

function warm(fn, iterations) {
  let sink = 0;

  for (let i = 0; i < iterations; i += 1) {
    sink ^= fn(i) & 1;
  }

  return sink;
}

function nowNs() {
  return Number(hrtime.bigint());
}

function maybeGc() {
  if (globalThis.gc) globalThis.gc();
}

function quantile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  );
  return sorted[index];
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length / 2) | 0];
}

function formatNs(ns) {
  if (ns >= 1e6) return `${(ns / 1e6).toFixed(3)} ms`;
  if (ns >= 1e3) return `${(ns / 1e3).toFixed(3)} us`;
  return `${ns.toFixed(1)} ns`;
}

function formatOpsSec(opsSec) {
  if (opsSec >= 1e6) return `${(opsSec / 1e6).toFixed(2)} Mops/s`;
  if (opsSec >= 1e3) return `${(opsSec / 1e3).toFixed(2)} Kops/s`;
  return `${opsSec.toFixed(1)} ops/s`;
}

function bench(label, fn, iterations = DEFAULT_ITERATIONS, warmup = DEFAULT_WARMUP) {
  warm(fn, warmup);
  maybeGc();

  let sink = 0;
  const startedAt = performance.now();

  for (let i = 0; i < iterations; i += 1) {
    sink ^= fn(i) & 1;
  }

  const elapsedMs = performance.now() - startedAt;
  const nsPerOp = (elapsedMs * 1e6) / iterations;
  console.log(`${label}: ${nsPerOp.toFixed(1)} ns/op | sink=${sink}`);
}

function benchTail(
  label,
  fn,
  iterations = 8000,
  warmup = 3000,
  sampleIterations = 2048,
  rounds = 9,
) {
  warm(fn, warmup);

  const opsSamples = [];
  const p50Samples = [];
  const p75Samples = [];
  const p95Samples = [];
  const p99Samples = [];
  const p999Samples = [];
  const maxSamples = [];
  let sink = 0;

  for (let round = 0; round < rounds; round += 1) {
    maybeGc();
    const bulkStart = nowNs();

    for (let i = 0; i < iterations; i += 1) {
      sink ^= fn(i + round * iterations) & 1;
    }

    const bulkNs = nowNs() - bulkStart;
    opsSamples.push((iterations * 1e9) / bulkNs);

    const latencies = [];

    for (let i = 0; i < sampleIterations; i += 1) {
      const start = nowNs();
      sink ^= fn(i + round * sampleIterations + 0x100000) & 1;
      latencies.push(nowNs() - start);
    }

    p50Samples.push(quantile(latencies, 0.5));
    p75Samples.push(quantile(latencies, 0.75));
    p95Samples.push(quantile(latencies, 0.95));
    p99Samples.push(quantile(latencies, 0.99));
    p999Samples.push(quantile(latencies, 0.999));
    maxSamples.push(Math.max(...latencies));
  }

  console.log(
    `${label}: ops/sec=${formatOpsSec(median(opsSamples))} | p50=${formatNs(
      median(p50Samples),
    )} | p75=${formatNs(median(p75Samples))} | p95=${formatNs(
      median(p95Samples),
    )} | p99=${formatNs(median(p99Samples))} | p999=${formatNs(
      median(p999Samples),
    )} | max=${formatNs(median(maxSamples))} | worstMax=${formatNs(
      Math.max(...maxSamples),
    )} | sink=${sink}`,
  );
}

function resetRuntime() {
  createRuntime();
}

function buildSignalCreate() {
  resetRuntime();

  return {
    run(i) {
      const [value] = signal(i);
      return value();
    },
  };
}

function buildSignalRead() {
  resetRuntime();

  const [value] = signal(1);

  return {
    run() {
      return value();
    },
  };
}

function buildSignalSetNoSubscribers() {
  resetRuntime();

  const [value, setValue] = signal(0);
  let next = 0;

  return {
    run() {
      next += 1;
      setValue(next);
      return value();
    },
  };
}

function buildSignalSetSameValue() {
  resetRuntime();

  const [value, setValue] = signal(1);

  return {
    run() {
      setValue(1);
      return value();
    },
  };
}

function buildComputedCleanRead() {
  resetRuntime();

  const [source] = signal(1);
  const doubled = computed(() => source() * 2);
  doubled();

  return {
    run() {
      return doubled();
    },
  };
}

function buildMemoCleanRead() {
  resetRuntime();

  const [source] = signal(1);
  const doubled = memo(() => source() * 2);

  return {
    run() {
      return doubled();
    },
  };
}

function buildComputedDirtyChain(depth) {
  resetRuntime();

  const [source, setSource] = signal(0);
  let current = computed(() => source() + 1);

  for (let i = 1; i < depth; i += 1) {
    const previous = current;
    current = computed(() => previous() + 1);
  }

  current();
  let next = 0;

  return {
    run() {
      next += 1;
      setSource(next);
      return current();
    },
  };
}

function buildEffectFlush() {
  const runtime = createRuntime();
  const [source, setSource] = signal(0);
  let seen = 0;

  effect(() => {
    seen = source();
  });

  let next = 0;

  return {
    run() {
      next += 1;
      setSource(next);
      runtime.flush();
      return seen;
    },
  };
}

function buildBatchManyWrites(width) {
  resetRuntime();

  const pairs = Array.from({ length: width }, (_, i) => signal(i));
  let next = 0;

  return {
    run() {
      next += 1;
      batch(() => {
        for (let i = 0; i < width; i += 1) {
          pairs[i][1](next + i);
        }
      });
      return pairs[width - 1][0]();
    },
  };
}

function buildEventEmitSubscribers(width) {
  const runtime = createRuntime();
  const source = event();
  let seen = 0;

  for (let i = 0; i < width; i += 1) {
    source.subscribe((value) => {
      seen ^= value + i;
    });
  }

  let next = 0;

  return {
    run() {
      next += 1;
      source.emit(next);
      runtime.flush();
      return seen;
    },
  };
}

const scenarios = {
  signal_create: () => buildSignalCreate(),
  signal_read: () => buildSignalRead(),
  signal_set_no_subscribers: () => buildSignalSetNoSubscribers(),
  signal_set_same_value: () => buildSignalSetSameValue(),
  computed_clean_read: () => buildComputedCleanRead(),
  memo_clean_read: () => buildMemoCleanRead(),
  computed_dirty_chain_32: () => buildComputedDirtyChain(32),
  effect_flush: () => buildEffectFlush(),
  batch_many_writes_32: () => buildBatchManyWrites(32),
  event_emit_subscribers_32: () => buildEventEmitSubscribers(32),
};

function runBenchSuite() {
  for (const [name, create] of Object.entries(scenarios)) {
    const scenario = create();
    bench(name, (i) => scenario.run(i));
  }
}

function runTailSuite() {
  for (const name of [
    "signal_read",
    "signal_set_no_subscribers",
    "computed_clean_read",
    "computed_dirty_chain_32",
    "effect_flush",
    "event_emit_subscribers_32",
  ]) {
    const scenario = scenarios[name]();
    benchTail(`p99_${name}`, (i) => scenario.run(i));
  }
}

function runScenario(name, tail = false) {
  const create = scenarios[name];

  if (create === undefined) {
    throw new Error(`Unknown scenario: ${name}`);
  }

  const scenario = create();
  const run = (i) => scenario.run(i);

  if (tail) benchTail(`p99_${name}`, run);
  else bench(name, run);
}

function main() {
  const mode = process.argv[2] ?? "bench";

  if (mode === "bench") {
    runBenchSuite();
    return;
  }

  if (mode === "p99") {
    runTailSuite();
    return;
  }

  if (mode === "scenario") {
    const name = process.argv[3];
    if (!name) throw new Error("scenario name is required");
    runScenario(name, false);
    return;
  }

  if (mode === "tail") {
    const name = process.argv[3];
    if (!name) throw new Error("scenario name is required");
    runScenario(name, true);
    return;
  }

  throw new Error(`Unknown mode: ${mode}`);
}

main();
