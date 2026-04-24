import { performance } from "node:perf_hooks";
import {
  CONSUMER_INITIAL_STATE,
  PRODUCER_INITIAL_STATE,
  ReactiveNode,
  WATCHER_INITIAL_STATE,
  readConsumer,
  readProducer,
  resetDefaultContext,
  runWatcher,
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

function setupScenario(kind) {
  resetDefaultContext();

  const head = createProducer(0);
  const double = createConsumer(() => readProducer(head) * 2);
  const inverse = createConsumer(() => -readProducer(head));

  const current = createConsumer(() => {
    let result = 0;

    if (kind === "repeated_reads") {
      for (let i = 0; i < 20; i += 1) {
        result += readProducer(head) % 2
          ? readConsumer(double)
          : readConsumer(inverse);
      }
      return result;
    }

    const value = readProducer(head);

    if (kind === "cached_head") {
      for (let i = 0; i < 20; i += 1) {
        result += value % 2 ? readConsumer(double) : readConsumer(inverse);
      }
      return result;
    }

    const branch = value % 2 ? readConsumer(double) : readConsumer(inverse);
    for (let i = 0; i < 20; i += 1) {
      result += branch;
    }

    return result;
  });

  let effectRuns = 0;
  const effect = createWatcher(() => {
    readConsumer(current);
    effectRuns += 1;
  });

  runWatcher(effect);

  return {
    run(iteration) {
      writeProducer(head, iteration);
      runWatcher(effect);
      return readConsumer(current) + effectRuns;
    },
  };
}

function runSuite() {
  const iterations = 20000;
  const warmup = 5000;

  bench(
    "branching_repeated_reads",
    (() => {
      const scenario = setupScenario("repeated_reads");
      return (i) => scenario.run(i);
    })(),
    iterations,
    warmup,
  );

  bench(
    "branching_cached_head",
    (() => {
      const scenario = setupScenario("cached_head");
      return (i) => scenario.run(i);
    })(),
    iterations,
    warmup,
  );

  bench(
    "branching_cached_head_and_branch",
    (() => {
      const scenario = setupScenario("cached_head_and_branch");
      return (i) => scenario.run(i);
    })(),
    iterations,
    warmup,
  );

  bench(
    "duplicate_read_single_source",
    (() => {
      resetDefaultContext();

      const head = createProducer(0);
      const current = createConsumer(() => {
        let result = 0;
        for (let i = 0; i < 20; i += 1) {
          result += readProducer(head);
        }
        return result;
      });
      const effect = createWatcher(() => readConsumer(current));

      runWatcher(effect);

      return (i) => {
        writeProducer(head, i);
        runWatcher(effect);
        return readConsumer(current);
      };
    })(),
    iterations,
    warmup,
  );

  bench(
    "duplicate_read_single_source_cached",
    (() => {
      resetDefaultContext();

      const head = createProducer(0);
      const current = createConsumer(() => {
        const value = readProducer(head);
        let result = 0;
        for (let i = 0; i < 20; i += 1) {
          result += value;
        }
        return result;
      });
      const effect = createWatcher(() => readConsumer(current));

      runWatcher(effect);

      return (i) => {
        writeProducer(head, i);
        runWatcher(effect);
        return readConsumer(current);
      };
    })(),
    iterations,
    warmup,
  );
}

runSuite();
