import { performance } from "node:perf_hooks";
import runtime from "../../build/esm/reactivity/context.js";
import {
  cleanupStaleSources,
  trackRead,
} from "../../build/esm/reactivity/engine/tracking.js";
import {
  CONSUMER_CHANGED,
  PRODUCER_INITIAL_STATE,
} from "../../build/esm/reactivity/shape/ReactiveMeta.js";
import { UNINITIALIZED } from "../../build/esm/reactivity/shape/ReactiveNode.js";
import ReactiveNode from "../../build/esm/reactivity/shape/ReactiveNode.js";
import { linkEdge } from "../../build/esm/reactivity/shape/methods/connect.js";

function createProducer(value) {
  return new ReactiveNode(value, null, PRODUCER_INITIAL_STATE);
}

function createConsumer() {
  return new ReactiveNode(UNINITIALIZED, null, CONSUMER_CHANGED);
}

function resetRuntime() {
  runtime.resetState();
  runtime.setHooks({});
}

function warm(fn, iterations) {
  let sink = 0;

  for (let i = 0; i < iterations; i += 1) {
    sink ^= fn(i) & 1;
  }

  return sink;
}

function bench(
  label,
  fn,
  iterations,
  warmup = iterations,
  unitsPerOp = 1,
  unitLabel = "op",
) {
  warm(fn, warmup);

  if (globalThis.gc) globalThis.gc();

  let sink = 0;
  const start = performance.now();

  for (let i = 0; i < iterations; i += 1) {
    sink ^= fn(i) & 1;
  }

  const elapsedMs = performance.now() - start;
  const totalUnits = iterations * unitsPerOp;
  const nsPerUnit = (elapsedMs * 1e6) / totalUnits;
  console.log(`${label}: ${nsPerUnit.toFixed(1)} ns/${unitLabel} | sink=${sink}`);
}

function buildStaticTrackingGraph(fanIn) {
  resetRuntime();

  const consumer = createConsumer();
  const sources = [];

  for (let i = 0; i < fanIn; i += 1) {
    const source = createProducer(i);
    sources.push(source);
    linkEdge(source, consumer);
  }

  return { consumer, sources };
}

function buildTrackReadStatic(fanIn) {
  const { consumer, sources } = buildStaticTrackingGraph(fanIn);

  return {
    fanIn,
    run() {
      runtime.activeComputed = consumer;
      consumer.depsTail = null;

      for (let i = 0; i < sources.length; i += 1) {
        trackRead(sources[i]);
      }

      cleanupStaleSources(consumer);
      runtime.activeComputed = null;
      return consumer.depsTail === consumer.lastIn ? fanIn : 0;
    },
  };
}

function buildTrackReadRotate(fanIn) {
  const { consumer, sources } = buildStaticTrackingGraph(fanIn);
  let offset = 0;

  return {
    fanIn,
    run() {
      offset = (offset + 1) % fanIn;
      runtime.activeComputed = consumer;
      consumer.depsTail = null;

      for (let i = 0; i < sources.length; i += 1) {
        trackRead(sources[(i + offset) % fanIn]);
      }

      cleanupStaleSources(consumer);
      runtime.activeComputed = null;
      return consumer.depsTail === consumer.lastIn ? offset & 1 : 0;
    },
  };
}

function buildCleanupStatic(fanIn) {
  const { consumer } = buildStaticTrackingGraph(fanIn);

  return {
    run() {
      consumer.depsTail = consumer.lastIn;
      cleanupStaleSources(consumer);
      return consumer.lastIn !== null ? 1 : 0;
    },
  };
}

function runBenchSuite() {
  const static8 = buildTrackReadStatic(8);
  const static64 = buildTrackReadStatic(64);
  const static512 = buildTrackReadStatic(512);
  const rotate64 = buildTrackReadRotate(64);
  const cleanup8 = buildCleanupStatic(8);
  const cleanup512 = buildCleanupStatic(512);

  bench("trackRead_static_8", () => static8.run(), 200000, 100000, static8.fanIn, "read");
  bench("trackRead_static_64", () => static64.run(), 100000, 50000, static64.fanIn, "read");
  bench("trackRead_static_512", () => static512.run(), 20000, 10000, static512.fanIn, "read");
  bench("trackRead_rotate_64", () => rotate64.run(), 20000, 10000, rotate64.fanIn, "read");
  bench("cleanup_static_8", () => cleanup8.run(), 300000, 100000);
  bench("cleanup_static_512", () => cleanup512.run(), 300000, 100000);
}

function runScenario(name) {
  switch (name) {
    case "trackRead_static_64": {
      const scenario = buildTrackReadStatic(64);
      bench(name, () => scenario.run(), 100000, 50000, scenario.fanIn, "read");
      return;
    }
    case "trackRead_static_512": {
      const scenario = buildTrackReadStatic(512);
      bench(name, () => scenario.run(), 20000, 10000, scenario.fanIn, "read");
      return;
    }
    case "trackRead_rotate_64": {
      const scenario = buildTrackReadRotate(64);
      bench(name, () => scenario.run(), 20000, 10000, scenario.fanIn, "read");
      return;
    }
    case "cleanup_static_512": {
      const scenario = buildCleanupStatic(512);
      bench(name, () => scenario.run(), 300000, 100000);
      return;
    }
    default:
      throw new Error(`Unknown scenario: ${name}`);
  }
}

function main() {
  const mode = process.argv[2] ?? "bench";

  if (mode === "bench") {
    runBenchSuite();
    return;
  }

  if (mode === "scenario") {
    const name = process.argv[3];
    if (!name) throw new Error("scenario name is required");
    runScenario(name);
    return;
  }

  throw new Error(`Unknown mode: ${mode}`);
}

main();
