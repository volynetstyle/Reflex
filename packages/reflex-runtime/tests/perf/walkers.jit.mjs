import { performance } from "node:perf_hooks";
import { hrtime } from "node:process";
import {
  Changed,
  ConsumerReadMode,
  CONSUMER_INITIAL_STATE,
  Consumer,
  Disposed,
  Invalid,
  PRODUCER_INITIAL_STATE,
  ReactiveNode,
  Reentrant,
  Tracking,
  Watcher,
  readConsumer,
  readProducer,
  resetState,
  runWatcher,
  setHooks,
  writeProducer,
} from "../../build/esm/index.js";
import { recompute } from "../../build/esm/reactivity/engine/compute.js";
import { executeNodeComputation } from "../../build/esm/reactivity/engine/execute.js";
import { linkEdge } from "../../build/esm/reactivity/shape/methods/connect.js";
import { propagate } from "../../build/esm/reactivity/walkers/propagate.js";
import { shouldRecompute } from "../../build/esm/reactivity/walkers/recompute.js";

const DIRTY_OR_WALKER =
  Invalid |
  Changed |
  Reentrant |
  Tracking;
const TRACKING_CONSUMER_STATE =
  Consumer | Tracking;

function createProducer(value) {
  return new ReactiveNode(value, null, PRODUCER_INITIAL_STATE);
}

function createConsumer(compute) {
  return new ReactiveNode(undefined, compute, CONSUMER_INITIAL_STATE);
}

function resetRuntime() {
  resetState();
  setHooks({});
}

function clearWalkerState(nodes) {
  for (let i = 0; i < nodes.length; i += 1) {
    nodes[i].state &= ~DIRTY_OR_WALKER;
  }
}

function buildPropagateChain(depth) {
  resetRuntime();

  const root = createProducer(0);
  const nodes = [];
  let parent = root;

  for (let i = 0; i < depth; i += 1) {
    const node = createConsumer(() => i);
    nodes.push(node);
    linkEdge(parent, node);
    parent = node;
  }

  const startEdge = root.firstOut;
  if (startEdge === null) throw new Error("propagate chain root has no edge");

  return {
    nodes,
    run() {
      propagate(startEdge, Changed);
      clearWalkerState(nodes);
      return nodes.length;
    },
  };
}

function buildPropagateFanout(width, depth) {
  resetRuntime();

  const root = createProducer(0);
  const nodes = [];

  for (let i = 0; i < width; i += 1) {
    let parent = createConsumer(() => i);
    nodes.push(parent);
    linkEdge(root, parent);

    for (let j = 1; j < depth; j += 1) {
      const child = createConsumer(() => i + j);
      nodes.push(child);
      linkEdge(parent, child);
      parent = child;
    }
  }

  const startEdge = root.firstOut;
  if (startEdge === null) throw new Error("propagate fanout root has no edge");

  return {
    nodes,
    run() {
      propagate(startEdge, Changed);
      clearWalkerState(nodes);
      return nodes.length;
    },
  };
}

function buildTrackedPrefix(fanIn, trackedCount) {
  resetRuntime();

  const target = createConsumer(() => 0);
  const producers = [];
  const edges = [];

  for (let i = 0; i < fanIn; i += 1) {
    const producer = createProducer(i);
    producers.push(producer);
    edges.push(linkEdge(producer, target));
  }

  const trackedEdge = edges[trackedCount - 1];
  const prefixEdge = edges[0];
  const staleEdge = edges[edges.length - 1];

  if (!trackedEdge || !prefixEdge || !staleEdge) {
    throw new Error("tracked-prefix graph is incomplete");
  }

  function resetTrackingState() {
    target.state = TRACKING_CONSUMER_STATE;
    target.lastInTail = trackedEdge;
  }

  return {
    prefix() {
      resetTrackingState();
      propagate(prefixEdge, Changed);
      return target.state;
    },
    stale() {
      resetTrackingState();
      propagate(staleEdge, Changed);
      return target.state;
    },
  };
}

function buildTrackedPrefixStress(fanIn, depsTailIndex, edgeIndex) {
  resetRuntime();

  const target = createConsumer(() => 0);
  const producers = [];
  const edges = [];

  for (let i = 0; i < fanIn; i += 1) {
    const producer = createProducer(i);
    producers.push(producer);
    edges.push(linkEdge(producer, target));
  }

  const depsTail = edges[depsTailIndex];
  const targetEdge = edges[edgeIndex];

  if (!depsTail || !targetEdge) {
    throw new Error("tracked-prefix stress graph is incomplete");
  }

  return {
    run() {
      target.state = TRACKING_CONSUMER_STATE;
      target.lastInTail = depsTail;
      propagate(targetEdge, Changed);
      return target.state;
    },
  };
}

function buildPropagateBranchingTrackingMix(width, depth) {
  resetRuntime();

  const root = createProducer(0);
  const nodes = [];
  const trackingAccept = [];
  const trackingReject = [];

  for (let i = 0; i < width; i += 1) {
    const branchRoot = createConsumer(() => i);
    nodes.push(branchRoot);
    const rootEdge = linkEdge(root, branchRoot);

    if ((i & 3) === 0) {
      trackingAccept.push({ node: branchRoot, depsTail: rootEdge });
    } else if ((i & 3) === 1) {
      const prefix = createProducer(-(i + 1));
      const prefixEdge = linkEdge(prefix, branchRoot, null);
      trackingReject.push({ node: branchRoot, depsTail: prefixEdge });
    }

    let parent = branchRoot;

    for (let j = 1; j < depth; j += 1) {
      const child = createConsumer(() => i + j);
      nodes.push(child);

      if (((i + j) & 7) === 2) {
        const prefix = createProducer(-(i * depth + j + 1));
        const prefixEdge = linkEdge(prefix, child, null);
        const edge = linkEdge(parent, child);
        trackingReject.push({ node: child, depsTail: prefixEdge });
        parent = child;
        void edge;
        continue;
      }

      const edge = linkEdge(parent, child);
      if (((i + j) & 7) === 0) {
        trackingAccept.push({ node: child, depsTail: edge });
      }

      parent = child;
    }
  }

  const startEdge = root.firstOut;
  if (startEdge === null) throw new Error("branching tracking mix root has no edge");

  function armTracking() {
    clearWalkerState(nodes);

    for (let i = 0; i < trackingAccept.length; i += 1) {
      const entry = trackingAccept[i];
      entry.node.state = TRACKING_CONSUMER_STATE;
      entry.node.lastInTail = entry.depsTail;
    }

    for (let i = 0; i < trackingReject.length; i += 1) {
      const entry = trackingReject[i];
      entry.node.state = TRACKING_CONSUMER_STATE;
      entry.node.lastInTail = entry.depsTail;
    }
  }

  return {
    run() {
      armTracking();
      propagate(startEdge, Changed);
      return nodes.length;
    },
  };
}

function buildShouldRecomputeChain(depth) {
  resetRuntime();

  const source = createProducer(0);
  let parent = createConsumer(() => readProducer(source) + 1);

  for (let i = 1; i < depth; i += 1) {
    const previous = parent;
    parent = createConsumer(() => readConsumer(previous) + 1);
  }

  const root = parent;
  readConsumer(root);

  let value = 0;

  return {
    run() {
      value += 1;
      writeProducer(source, value);
      const dirty = shouldRecompute(root);
      if (dirty) recompute(root);
      else readConsumer(root);
      return root.payload;
    },
  };
}

function buildShouldRecomputeDiamond() {
  resetRuntime();

  const source = createProducer(0);
  const shared = createConsumer(() => readProducer(source) + 1);
  const left = createConsumer(() => readConsumer(shared) + 1);
  const right = createConsumer(() => readConsumer(shared) + 2);
  const root = createConsumer(() => readConsumer(left) + readConsumer(right));

  readConsumer(root);

  let value = 0;

  return {
    run() {
      value += 1;
      writeProducer(source, value);
      const dirty = shouldRecompute(root);
      if (dirty) recompute(root);
      else readConsumer(root);
      return root.payload;
    },
  };
}

function buildExecuteNodeComputationStatic(fanIn) {
  resetRuntime();

  const sources = [];

  for (let i = 0; i < fanIn; i += 1) {
    sources.push(createProducer(i));
  }

  const node = createConsumer(() => {
    let sum = 0;

    for (let i = 0; i < sources.length; i += 1) {
      sum += readProducer(sources[i]);
    }

    return sum;
  });

  readConsumer(node);

  let value = 0;

  return {
    run() {
      value += 1;
      sources[0].payload = value;
      const result = executeNodeComputation(node);
      node.payload = result;
      return result;
    },
  };
}

function buildExecuteNodeComputationChurn(fanIn, narrowWidth) {
  resetRuntime();

  const sources = [];

  for (let i = 0; i < fanIn; i += 1) {
    sources.push(createProducer(i));
  }

  let wide = true;
  const node = createConsumer(() => {
    let sum = 0;
    const limit = wide ? fanIn : narrowWidth;

    for (let i = 0; i < limit; i += 1) {
      sum += readProducer(sources[i]);
    }

    return sum;
  });

  readConsumer(node);

  let value = 0;

  return {
    run() {
      wide = !wide;
      value += 1;
      sources[0].payload = value;
      const result = executeNodeComputation(node);
      node.payload = result;
      return result;
    },
  };
}

function buildRecomputeStatic(fanIn) {
  resetRuntime();

  const sources = [];

  for (let i = 0; i < fanIn; i += 1) {
    sources.push(createProducer(i));
  }

  const node = createConsumer(() => {
    let sum = 0;

    for (let i = 0; i < sources.length; i += 1) {
      sum += readProducer(sources[i]);
    }

    return sum;
  });

  readConsumer(node);

  let value = 0;

  return {
    run() {
      value += 1;
      sources[0].payload = value;
      node.state |= Invalid;
      return recompute(node) ? 1 : 0;
    },
  };
}

function buildRecomputeChurn(fanIn, narrowWidth) {
  resetRuntime();

  const sources = [];

  for (let i = 0; i < fanIn; i += 1) {
    sources.push(createProducer(i));
  }

  let wide = true;
  const node = createConsumer(() => {
    let sum = 0;
    const limit = wide ? fanIn : narrowWidth;

    for (let i = 0; i < limit; i += 1) {
      sum += readProducer(sources[i]);
    }

    return sum;
  });

  readConsumer(node);

  let value = 0;

  return {
    run() {
      wide = !wide;
      value += 1;
      sources[0].payload = value;
      node.state |= Invalid;
      return recompute(node) ? 1 : 0;
    },
  };
}

function buildReadConsumerDirtyChain(depth, mode = ConsumerReadMode.lazy) {
  resetRuntime();

  const source = createProducer(0);
  let parent = createConsumer(() => readProducer(source) + 1);

  for (let i = 1; i < depth; i += 1) {
    const previous = parent;
    parent = createConsumer(() => readConsumer(previous) + 1);
  }

  const root = parent;
  readConsumer(root);

  let value = 0;

  return {
    run() {
      value += 1;
      writeProducer(source, value);
      return readConsumer(root, mode);
    },
  };
}

function buildWriteProducerNoSubscribers() {
  resetRuntime();

  const source = createProducer(0);
  let value = 0;

  return {
    run() {
      value += 1;
      writeProducer(source, value);
      return value;
    },
  };
}

function buildWriteProducerFanout(width, depth) {
  resetRuntime();

  const source = createProducer(0);
  const nodes = [];

  for (let i = 0; i < width; i += 1) {
    let parent = createConsumer(() => i);
    nodes.push(parent);
    linkEdge(source, parent);

    for (let j = 1; j < depth; j += 1) {
      const child = createConsumer(() => i + j);
      nodes.push(child);
      linkEdge(parent, child);
      parent = child;
    }
  }

  let value = 0;

  return {
    run() {
      value += 1;
      writeProducer(source, value);
      clearWalkerState(nodes);
      return nodes.length;
    },
  };
}

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

function bench(label, fn, iterations, warmup = iterations) {
  warm(fn, warmup);

  if (globalThis.gc) {
    globalThis.gc();
  }

  let sink = 0;
  const start = performance.now();

  for (let i = 0; i < iterations; i += 1) {
    sink ^= fn(i) & 1;
  }

  const elapsedMs = performance.now() - start;
  const nsPerOp = (elapsedMs * 1e6) / iterations;
  console.log(`${label}: ${nsPerOp.toFixed(1)} ns/op | sink=${sink}`);
}

function benchTailLatency(
  label,
  fn,
  iterations,
  warmup = iterations >> 1,
  sampleIterations = 256,
  rounds = 7,
) {
  warm(fn, warmup);

  const opsSamples = [];
  const p50Samples = [];
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
    p95Samples.push(quantile(latencies, 0.95));
    p99Samples.push(quantile(latencies, 0.99));
    p999Samples.push(quantile(latencies, 0.999));
    maxSamples.push(Math.max(...latencies));
  }

  console.log(
    `${label}: ops/sec=${formatOpsSec(median(opsSamples))} | p50=${formatNs(
      median(p50Samples),
    )} | p95=${formatNs(median(p95Samples))} | p99=${formatNs(
      median(p99Samples),
    )} | p999=${formatNs(median(p999Samples))} | max=${formatNs(
      median(maxSamples),
    )} | sink=${sink}`,
  );
}

function benchTailLatencyWithHooks({
  label,
  prepare,
  run,
  cleanup,
  iterations,
  warmup = iterations >> 1,
  sampleIterations = 256,
  rounds = 7,
}) {
  for (let i = 0; i < warmup; i += 1) {
    prepare?.(i);
    run(i);
    cleanup?.(i);
  }

  const opsSamples = [];
  const p50Samples = [];
  const p95Samples = [];
  const p99Samples = [];
  const p999Samples = [];
  const maxSamples = [];
  let sink = 0;

  for (let round = 0; round < rounds; round += 1) {
    maybeGc();
    const bulkStart = nowNs();

    for (let i = 0; i < iterations; i += 1) {
      const index = i + round * iterations;
      prepare?.(index);
      sink ^= run(index) & 1;
      cleanup?.(index);
    }

    const bulkNs = nowNs() - bulkStart;
    opsSamples.push((iterations * 1e9) / bulkNs);

    const latencies = [];
    for (let i = 0; i < sampleIterations; i += 1) {
      const index = i + round * sampleIterations + 0x100000;
      prepare?.(index);
      const start = nowNs();
      sink ^= run(index) & 1;
      latencies.push(nowNs() - start);
      cleanup?.(index);
    }

    p50Samples.push(quantile(latencies, 0.5));
    p95Samples.push(quantile(latencies, 0.95));
    p99Samples.push(quantile(latencies, 0.99));
    p999Samples.push(quantile(latencies, 0.999));
    maxSamples.push(Math.max(...latencies));
  }

  console.log(
    `${label}: ops/sec=${formatOpsSec(median(opsSamples))} | p50=${formatNs(
      median(p50Samples),
    )} | p95=${formatNs(median(p95Samples))} | p99=${formatNs(
      median(p99Samples),
    )} | p999=${formatNs(median(p999Samples))} | max=${formatNs(
      median(maxSamples),
    )} | sink=${sink}`,
  );
}

function runBenchSuite() {
  const chain = buildPropagateChain(64);
  const fanout = buildPropagateFanout(32, 8);
  const trackedPrefix = buildTrackedPrefix(128, 64);
  const recomputeChain = buildShouldRecomputeChain(32);
  const recomputeDiamond = buildShouldRecomputeDiamond();

  bench("propagate_chain", () => chain.run(), 200000);
  bench("propagate_fanout", () => fanout.run(), 100000);
  bench("tracked_prefix_hit", () => trackedPrefix.prefix(), 200000);
  bench("tracked_prefix_miss", () => trackedPrefix.stale(), 200000);
  bench("shouldRecompute_chain", () => recomputeChain.run(), 100000, 50000);
  bench("shouldRecompute_diamond", () => recomputeDiamond.run(), 100000, 50000);
}

function runEngineBenchSuite() {
  const executeStatic = buildExecuteNodeComputationStatic(32);
  const executeChurn = buildExecuteNodeComputationChurn(32, 16);
  const recomputeStatic = buildRecomputeStatic(32);
  const recomputeChurn = buildRecomputeChurn(32, 16);
  const readLazyChain = buildReadConsumerDirtyChain(32, ConsumerReadMode.lazy);
  const readEagerChain = buildReadConsumerDirtyChain(32, ConsumerReadMode.eager);
  const writeNoSubscribers = buildWriteProducerNoSubscribers();
  const writeFanout = buildWriteProducerFanout(32, 8);

  bench("executeNodeComputation_static", () => executeStatic.run(), 100000, 50000);
  bench("executeNodeComputation_churn", () => executeChurn.run(), 100000, 50000);
  bench("recompute_static", () => recomputeStatic.run(), 100000, 50000);
  bench("recompute_churn", () => recomputeChurn.run(), 100000, 50000);
  bench("api_readConsumer_lazy_chain", () => readLazyChain.run(), 100000, 50000);
  bench("api_readConsumer_eager_chain", () => readEagerChain.run(), 100000, 50000);
  bench("api_writeProducer_no_subscribers", () => writeNoSubscribers.run(), 300000, 100000);
  bench("api_writeProducer_fanout", () => writeFanout.run(), 100000, 50000);
}

function buildWriteProducerWideFanout(width) {
  resetRuntime();

  const source = createProducer(0);
  const nodes = [];

  for (let i = 0; i < width; i += 1) {
    const leaf = createConsumer(() => i);
    nodes.push(leaf);
    linkEdge(source, leaf);
  }

  let value = 0;

  return {
    run() {
      value += 1;
      writeProducer(source, value);
      clearWalkerState(nodes);
      return nodes.length;
    },
  };
}

function buildSharedFanoutWatchers(width) {
  let invalidations = 0;
  resetRuntime({
    onSinkInvalidated() {
      invalidations += 1;
    },
  });

  const source = createProducer(0);
  const shared = createConsumer(() => readProducer(source) * 2);
  const watchers = [];

  for (let i = 0; i < width; i += 1) {
    const watcher = new ReactiveNode(
      null,
      () => {
        readConsumer(shared);
      },
      Watcher | Changed,
    );
    watchers.push(watcher);
    runWatcher(watcher);
  }

  let value = 0;

  return {
    run() {
      value += 1;
      const before = invalidations;
      writeProducer(source, value);

      for (let i = 0; i < watchers.length; i += 1) {
        runWatcher(watchers[i]);
      }

      return (invalidations - before) ^ (shared.payload & 1);
    },
  };
}

function buildRunWatcherSharedFanout(width) {
  let invalidations = 0;
  resetRuntime({
    onSinkInvalidated() {
      invalidations += 1;
    },
  });

  const source = createProducer(0);
  const shared = createConsumer(() => readProducer(source) * 2);
  const watchers = [];

  for (let i = 0; i < width; i += 1) {
    const watcher = new ReactiveNode(
      null,
      () => {
        readConsumer(shared);
      },
      Watcher | Changed,
    );
    watchers.push(watcher);
    runWatcher(watcher);
  }

  const first = watchers[0];
  let value = 0;
  let beforeInvalidations = 0;

  return {
    prepare() {
      value += 1;
      beforeInvalidations = invalidations;
      writeProducer(source, value);
    },
    run() {
      runWatcher(first);
      return (invalidations - beforeInvalidations) ^ (shared.payload & 1);
    },
    cleanup() {
      for (let i = 1; i < watchers.length; i += 1) {
        runWatcher(watchers[i]);
      }
    },
  };
}

function runTailBenchSuite() {
  const wideFanout = buildWriteProducerWideFanout(4096);
  const sharedWatchers = buildSharedFanoutWatchers(256);
  const sharedWatcherRun = buildRunWatcherSharedFanout(256);

  benchTailLatency(
    "p99_writeProducer_wide_fanout_4096",
    () => wideFanout.run(),
    6000,
    2000,
    384,
  );
  benchTailLatency(
    "p99_shared_fanout_watchers_256",
    () => sharedWatchers.run(),
    3000,
    1000,
    256,
  );
  benchTailLatencyWithHooks({
    label: "p99_runWatcher_shared_propagateOnce_256",
    prepare: () => sharedWatcherRun.prepare(),
    run: () => sharedWatcherRun.run(),
    cleanup: () => sharedWatcherRun.cleanup(),
    iterations: 3000,
    warmup: 1000,
    sampleIterations: 256,
  });
}

function runSingleScenario(name) {
  switch (name) {
    case "tracked_prefix_stress_true": {
      const scenario = buildTrackedPrefixStress(1024, 768, 767);
      bench(name, () => scenario.run(), 200000);
      return;
    }
    case "tracked_prefix_stress_false": {
      const scenario = buildTrackedPrefixStress(1024, 31, 1023);
      bench(name, () => scenario.run(), 200000);
      return;
    }
    case "propagate_branching_tracking_mix": {
      const scenario = buildPropagateBranchingTrackingMix(32, 8);
      bench(name, () => scenario.run(), 100000);
      return;
    }
    case "shouldRecompute_chain": {
      const scenario = buildShouldRecomputeChain(32);
      bench(name, () => scenario.run(), 100000, 50000);
      return;
    }
    case "shouldRecompute_diamond": {
      const scenario = buildShouldRecomputeDiamond();
      bench(name, () => scenario.run(), 100000, 50000);
      return;
    }
    case "executeNodeComputation_static": {
      const scenario = buildExecuteNodeComputationStatic(32);
      bench(name, () => scenario.run(), 100000, 50000);
      return;
    }
    case "executeNodeComputation_churn": {
      const scenario = buildExecuteNodeComputationChurn(32, 16);
      bench(name, () => scenario.run(), 100000, 50000);
      return;
    }
    case "recompute_static": {
      const scenario = buildRecomputeStatic(32);
      bench(name, () => scenario.run(), 100000, 50000);
      return;
    }
    case "recompute_churn": {
      const scenario = buildRecomputeChurn(32, 16);
      bench(name, () => scenario.run(), 100000, 50000);
      return;
    }
    case "api_readConsumer_lazy_chain": {
      const scenario = buildReadConsumerDirtyChain(32, ConsumerReadMode.lazy);
      bench(name, () => scenario.run(), 100000, 50000);
      return;
    }
    case "api_readConsumer_eager_chain": {
      const scenario = buildReadConsumerDirtyChain(32, ConsumerReadMode.eager);
      bench(name, () => scenario.run(), 100000, 50000);
      return;
    }
    case "api_writeProducer_no_subscribers": {
      const scenario = buildWriteProducerNoSubscribers();
      bench(name, () => scenario.run(), 300000, 100000);
      return;
    }
    case "api_writeProducer_fanout": {
      const scenario = buildWriteProducerFanout(32, 8);
      bench(name, () => scenario.run(), 100000, 50000);
      return;
    }
    case "p99_writeProducer_wide_fanout_4096": {
      const scenario = buildWriteProducerWideFanout(4096);
      benchTailLatency(name, () => scenario.run(), 6000, 2000, 384);
      return;
    }
    case "p99_shared_fanout_watchers_256": {
      const scenario = buildSharedFanoutWatchers(256);
      benchTailLatency(name, () => scenario.run(), 3000, 1000, 256);
      return;
    }
    case "p99_propagate_chain_64": {
      const scenario = buildPropagateChain(64);
      benchTailLatency(name, () => scenario.run(), 8000, 3000, 2048, 7);
      return;
    }
    case "p99_runWatcher_shared_propagateOnce_256": {
      const scenario = buildRunWatcherSharedFanout(256);
      benchTailLatencyWithHooks({
        label: name,
        prepare: () => scenario.prepare(),
        run: () => scenario.run(),
        cleanup: () => scenario.cleanup(),
        iterations: 3000,
        warmup: 1000,
        sampleIterations: 256,
      });
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

  if (mode === "engine") {
    runEngineBenchSuite();
    return;
  }

  if (mode === "p99") {
    runTailBenchSuite();
    return;
  }

  if (mode === "scenario") {
    const name = process.argv[3];
    if (!name) throw new Error("scenario name is required");
    runSingleScenario(name);
    return;
  }

  throw new Error(`Unknown mode: ${mode}`);
}

main();
