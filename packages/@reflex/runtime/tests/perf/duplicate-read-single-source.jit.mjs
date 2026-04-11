import { performance } from "node:perf_hooks";
import {
  CONSUMER_INITIAL_STATE,
  PRODUCER_INITIAL_STATE,
  ReactiveNode,
  WATCHER_INITIAL_STATE,
  createRuntimePerfCounters,
  readConsumer,
  readProducer,
  resetDefaultContext,
  runWatcher,
  setRuntimePerfCounters,
  writeProducer,
} from "../../build/esm/index.js";
import { UNINITIALIZED } from "../../build/esm/reactivity/shape/ReactiveNode.js";

function createProducer(value) {
  return new ReactiveNode(value, null, PRODUCER_INITIAL_STATE);
}

function createConsumer(compute) {
  return new ReactiveNode(UNINITIALIZED, compute, CONSUMER_INITIAL_STATE);
}

function createWatcher(compute) {
  return new ReactiveNode(UNINITIALIZED, compute, WATCHER_INITIAL_STATE);
}

function warm(fn, iterations) {
  let sink = 0;

  for (let i = 0; i < iterations; i += 1) {
    sink ^= fn(i) & 1;
  }

  return sink;
}

function bench(label, fn, iterations, warmup = iterations) {
  warm(fn, warmup);

  if (globalThis.gc) globalThis.gc();

  let sink = 0;
  const start = performance.now();

  for (let i = 0; i < iterations; i += 1) {
    sink ^= fn(i) & 1;
  }

  const elapsedMs = performance.now() - start;
  const nsPerWrite = (elapsedMs * 1e6) / iterations;
  console.log(`${label}: ${nsPerWrite.toFixed(1)} ns/write | sink=${sink}`);
}

function createScenario(kind) {
  resetDefaultContext();

  const counters = createRuntimePerfCounters();
  setRuntimePerfCounters(counters);

  const head = createProducer(0);
  const current = createConsumer(() => {
    let result = 0;

    if (kind === "repeated") {
      for (let i = 0; i < 20; i += 1) {
        result += readProducer(head);
      }
      return result;
    }

    const value = readProducer(head);
    for (let i = 0; i < 20; i += 1) {
      result += value;
    }

    return result;
  });
  const effect = createWatcher(() => readConsumer(current));

  runWatcher(effect);

  return {
    counters,
    run(iteration) {
      writeProducer(head, iteration);
      runWatcher(effect);
      return readConsumer(current);
    },
  };
}

function printCounters(label, counters, iterations) {
  console.log(`${label}:`);
  console.log(
    JSON.stringify(
      {
        ...counters,
        trackReadCallsPerUniqueDep: counters.trackReadCalls,
        trackReadCallsPerWrite: counters.trackReadCalls / iterations,
      },
      null,
      2,
    ),
  );
}

function runProfile(label, kind, iterations) {
  const scenario = createScenario(kind);

  for (let i = 0; i < iterations; i += 1) {
    scenario.run(i);
  }

  printCounters(label, scenario.counters, iterations);
}

function runSuite() {
  const iterations = 30000;
  const warmup = 5000;

  bench(
    "duplicate_read_single_source",
    (() => {
      const scenario = createScenario("repeated");
      return (i) => scenario.run(i);
    })(),
    iterations,
    warmup,
  );

  bench(
    "duplicate_read_single_source_cached",
    (() => {
      const scenario = createScenario("cached");
      return (i) => scenario.run(i);
    })(),
    iterations,
    warmup,
  );

  runProfile("duplicate_read_single_source_profile", "repeated", 100);
  runProfile("duplicate_read_single_source_cached_profile", "cached", 100);
  setRuntimePerfCounters(null);
}

runSuite();
