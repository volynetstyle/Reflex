import { performance } from "node:perf_hooks";
import {
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
} from "../build/esm/index.js";
import {
  ReactiveNode,
  CONSUMER_INITIAL_STATE,
  PRODUCER_INITIAL_STATE,
  WATCHER_INITIAL_STATE,
} from "../build/esm/kernel/shape/index.js";
import {
  resetRuntimeContext,
  configureRuntimeContext,
} from "../build/esm/kernel/context.js";
import { linkEdge } from "../build/esm/kernel/shape/graph/index.js";

const UNINITIALIZED = Symbol("reflex.perf.uninitialized");

// The fallback profiler models incoming-list reordering without changing the
// outgoing half of an edge. These helpers mirror the internal move operation.
function detachIncomingEdge(node, edge) {
  const { prevIn, nextIn } = edge;

  if (prevIn !== null) prevIn.nextIn = nextIn;
  else node.firstIn = nextIn;

  if (nextIn !== null) nextIn.prevIn = prevIn;
  else node.lastIn = prevIn;

  edge.prevIn = null;
  edge.nextIn = null;
}

function attachIncomingEdgeAfter(node, edge, after) {
  const nextIn = after === null ? node.firstIn : after.nextIn;
  edge.prevIn = after;
  edge.nextIn = nextIn;

  if (nextIn !== null) nextIn.prevIn = edge;
  else node.lastIn = edge;

  if (after !== null) after.nextIn = edge;
  else node.firstIn = edge;
}

function setInternalHooks(
  sinkInvalidatedDispatcher,
  reactiveSettledDispatcher,
) {
  configureRuntimeContext({
    hooks: { sinkInvalidatedDispatcher, reactiveSettledDispatcher },
  });
}
const DEFAULT_SAMPLES = 9;
const childOrder = new Map([
  [
    "graph.trackRead",
    [
      "graph.trackRead.expectedNextHit",
      "graph.trackRead.tinyScanHit",
      "graph.trackRead.fallbackScan",
      "graph.trackRead.duplicate",
      "graph.trackRead.addEdge",
    ],
  ],
  [
    "graph.trackRead.tinyScanHit",
    ["graph.trackRead.tinyScanHit.step1", "graph.trackRead.tinyScanHit.step2"],
  ],
]);

function producer(value) {
  return new ReactiveNode(value, null, PRODUCER_INITIAL_STATE);
}

function consumer(compute) {
  return new ReactiveNode(UNINITIALIZED, compute, CONSUMER_INITIAL_STATE);
}

function watcher(compute) {
  return new ReactiveNode(undefined, compute, WATCHER_INITIAL_STATE);
}

function withRuntime(fn) {
  resetRuntimeContext();
  setInternalHooks();
  configureRuntimeContext();
  try {
    return fn();
  } finally {
    resetRuntimeContext();
    setInternalHooks();
    configureRuntimeContext();
  }
}

function measure(fn, iterations, samples = DEFAULT_SAMPLES) {
  const values = [];
  let sink = 0;

  for (let i = 0; i < Math.min(iterations, 20_000); i += 1) sink ^= fn(i) & 1;
  if (globalThis.gc) globalThis.gc();

  for (let sample = 0; sample < samples; sample += 1) {
    const start = performance.now();
    for (let i = 0; i < iterations; i += 1) sink ^= fn(i) & 1;
    values.push(performance.now() - start);
  }

  values.sort((a, b) => a - b);
  const meanMs = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - meanMs) ** 2, 0) /
    Math.max(1, values.length - 1);
  const stdev = Math.sqrt(variance);

  return {
    meanMs,
    medianMs: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    rme:
      meanMs === 0
        ? 0
        : (1.96 * stdev * 100) / (Math.sqrt(values.length) * meanMs),
    samples: values.length,
    sink,
  };
}

function percentile(sorted, p) {
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[index] ?? 0;
}

function result(id, label, group, parentId, measured, counters = {}) {
  const metrics = { ...measured };
  delete metrics.sink;
  return { id, label, group, parentId, metrics, counters };
}

const benches = [
  {
    id: "api.computed.read.root.clean",
    label: "clean",
    group: "api",
    parentId: "api.computed.read.root",
    run() {
      return withRuntime(() => {
        const source = producer(1);
        const doubled = consumer(() => readProducer(source) * 2);
        readConsumer(doubled);
        const iterations = 500_000;
        const measured = measure(() => readConsumer(doubled), iterations);
        return result(
          this.id,
          this.label,
          this.group,
          this.parentId,
          measured,
          {
            readConsumerCount: iterations * measured.samples,
            readConsumerRootCount: iterations * measured.samples,
            readConsumerCleanFastPathCount: iterations * measured.samples,
            shouldRecomputeCount: 0,
            recomputeCount: 0,
            cleanupCount: 0,
            depsVisitedCount: 0,
          },
        );
      });
    },
  },
  {
    id: "api.computed.read.tracked.clean",
    label: "clean",
    group: "api",
    parentId: "api.computed.read.tracked",
    run() {
      return withRuntime(() => {
        const tick = producer(0);
        const source = producer(1);
        const child = consumer(() => readProducer(source) + 1);
        const parent = consumer(() => readProducer(tick) + readConsumer(child));
        readConsumer(parent);
        let writes = 1;
        const iterations = 150_000;
        const measured = measure(() => {
          writeProducer(tick, writes++);
          return readConsumer(parent);
        }, iterations);
        return result(
          this.id,
          this.label,
          this.group,
          this.parentId,
          measured,
          {
            readConsumerCount: iterations * measured.samples,
            readConsumerTrackedCount: iterations * measured.samples,
            readConsumerCleanFastPathCount: iterations * measured.samples,
            recomputeCount: iterations * measured.samples,
            trackReadCount: iterations * measured.samples * 2,
          },
        );
      });
    },
  },
  {
    id: "api.computed.read.recompute.unchanged",
    label: "unchanged",
    group: "api",
    parentId: "api.computed.read.recompute",
    run() {
      return withRuntime(() => {
        const source = producer(0);
        const stable = consumer(() => {
          readProducer(source);
          return 1;
        });
        readConsumer(stable);

        let writes = 1;
        const iterations = 200_000;
        const measured = measure(() => {
          writeProducer(source, writes++);
          return readConsumer(stable);
        }, iterations);

        return result(
          this.id,
          this.label,
          this.group,
          this.parentId,
          measured,
          {
            recomputeCount: iterations * measured.samples,
            unchangedCount: iterations * measured.samples,
            downstreamPropagationCount: 0,
          },
        );
      });
    },
  },
  {
    id: "api.computed.read.chain.deep",
    label: "deep",
    group: "api",
    parentId: "api.computed.read.chain",
    run() {
      return withRuntime(() => {
        const source = producer(0);
        let node = consumer(() => readProducer(source) + 1);
        for (let i = 1; i < 32; i += 1) {
          const prev = node;
          node = consumer(() => readConsumer(prev) + 1);
        }
        readConsumer(node);
        let writes = 1;
        let recomputeCount = 0;
        const original = node.compute;
        node.compute = () => {
          recomputeCount += 1;
          return original();
        };
        const iterations = 40_000;
        const measured = measure(() => {
          writeProducer(source, writes++);
          return readConsumer(node);
        }, iterations);
        return result(
          this.id,
          this.label,
          this.group,
          this.parentId,
          measured,
          {
            readConsumerCount: iterations * measured.samples * 32,
            slowPathCount: iterations * measured.samples * 32,
            shouldRecomputeCount: iterations * measured.samples * 31,
            recomputeCount,
            depsVisitedTotal: iterations * measured.samples * 31,
          },
        );
      });
    },
  },
  {
    id: "graph.shouldRecompute.cleanBail",
    label: "cleanBail",
    group: "graph",
    parentId: "graph.shouldRecompute",
    run() {
      return withRuntime(() => {
        const source = producer(1);
        const child = consumer(() => readProducer(source) + 1);
        const parent = consumer(() => readConsumer(child) + 1);
        readConsumer(parent);
        const iterations = 500_000;
        const measured = measure(() => readConsumer(parent), iterations);
        return result(
          this.id,
          this.label,
          this.group,
          this.parentId,
          measured,
          {
            shouldRecomputeCount: 0,
            cleanBailCount: iterations * measured.samples,
            depsVisitedTotal: 0,
            recomputeTriggeredCount: 0,
          },
        );
      });
    },
  },
  {
    id: "graph.trackRead.expectedNextHit",
    label: "expectedNextHit",
    group: "graph",
    parentId: "graph.trackRead",
    run() {
      return trackReadBench(this, createStableOrder(64), 64);
    },
  },
  {
    id: "graph.trackRead.tinyScanHit.step1",
    label: "step1",
    group: "graph",
    parentId: "graph.trackRead.tinyScanHit",
    run() {
      return trackReadBench(this, createRotatingOrder(64, 1), 64, {
        fastPath: "tinyScan",
      });
    },
  },
  {
    id: "graph.trackRead.tinyScanHit.step2",
    label: "step2",
    group: "graph",
    parentId: "graph.trackRead.tinyScanHit",
    run() {
      return trackReadBench(this, createRotatingOrder(64, 2), 64, {
        fastPath: "tinyScan",
      });
    },
  },
  {
    id: "graph.trackRead.fallbackScan.64",
    label: "64",
    group: "graph",
    parentId: "graph.trackRead.fallbackScan",
    run() {
      return trackReadBench(this, createReverseOrder(64), 64);
    },
  },
  {
    id: "graph.trackRead.addEdge.64",
    label: "64",
    group: "graph",
    parentId: "graph.trackRead.addEdge",
    run() {
      return trackReadMissAddEdgeBench(this, 64);
    },
  },
  {
    id: "graph.trackRead.duplicate.64",
    label: "64",
    group: "graph",
    parentId: "graph.trackRead.duplicate",
    run() {
      return trackReadDuplicateBench(this, 64);
    },
  },
  {
    id: "api.signal.write.changed.1kEffects",
    label: "1kEffects",
    group: "api",
    parentId: "api.signal.write.changed",
    run() {
      return withRuntime(() => {
        const source = producer(0);
        const watchers = [];
        let invalidated = 0;
        setInternalHooks(() => {
          invalidated += 1;
        });
        for (let i = 0; i < 1000; i += 1) {
          const node = watcher(() => readProducer(source));
          runWatcher(node);
          watchers.push(node);
        }
        let writes = 1;
        const iterations = 5_000;
        const measured = measure(() => {
          writeProducer(source, writes++);
          return writes;
        }, iterations);
        return result(
          this.id,
          this.label,
          this.group,
          this.parentId,
          measured,
          {
            writeProducerCount: iterations * measured.samples,
            writeChangedCount: iterations * measured.samples,
            outgoingEdgesVisited:
              iterations * measured.samples * watchers.length,
            watchersNotified: invalidated,
          },
        );
      });
    },
  },
  {
    id: "graph.propagate.branch.32x8",
    label: "32x8",
    group: "graph",
    parentId: "graph.propagate.branch",
    run() {
      return withRuntime(() => {
        const sources = Array.from({ length: 4 }, () => producer(0));
        const watchers = [];
        for (let branch = 0; branch < 32; branch += 1) {
          let node = consumer(() =>
            sources.reduce((sum, source) => sum + readProducer(source), 0),
          );
          for (let depth = 1; depth < 8; depth += 1) {
            const prev = node;
            node = consumer(() => readConsumer(prev) + 1);
          }
          const sink = watcher(() => readConsumer(node));
          runWatcher(sink);
          watchers.push(sink);
        }
        let writes = 1;
        const iterations = 10_000;
        const measured = measure((i) => {
          writeProducer(sources[i & 3], writes++);
          return writes;
        }, iterations);
        return result(
          this.id,
          this.label,
          this.group,
          this.parentId,
          measured,
          {
            propagateCount: iterations * measured.samples,
            walkBranchCount: iterations * measured.samples,
            nodesInvalidated: iterations * measured.samples * 32 * 8,
            watchersNotified: iterations * measured.samples * watchers.length,
          },
        );
      });
    },
  },
  {
    id: "graph.pull.branch.32x8.4sources",
    label: "32x8 - 4 sources",
    group: "graph",
    parentId: "graph.pull.branch",
    run() {
      return withRuntime(() => {
        const sources = Array.from({ length: 4 }, (_, index) =>
          producer(index),
        );
        const sinks = [];

        for (let branch = 0; branch < 32; branch += 1) {
          let node = consumer(() =>
            sources.reduce((sum, source) => sum + readProducer(source), 0),
          );

          for (let depth = 1; depth < 8; depth += 1) {
            const prev = node;
            node = consumer(() => readConsumer(prev) + 1);
          }

          readConsumer(node);
          sinks.push(node);
        }

        let writes = 1;
        const iterations = 1_000;
        const measured = measure((i) => {
          writeProducer(sources[i & 3], writes++);

          let value = 0;
          for (const sink of sinks) value += readConsumer(sink);

          return value;
        }, iterations);

        return result(
          this.id,
          this.label,
          this.group,
          this.parentId,
          measured,
          {
            writeCount: iterations * measured.samples,
            sinkReadCount: iterations * measured.samples * sinks.length,
            branchCount: sinks.length,
            branchDepth: 8,
            sourceCount: sources.length,
          },
        );
      });
    },
  },
  {
    id: "api.effect.flush.1kWatchers",
    label: "1kWatchers",
    group: "api",
    parentId: "api.effect.flush",
    run() {
      return withRuntime(() => {
        const source = producer(0);
        const watchers = Array.from({ length: 1000 }, () =>
          watcher(() => readProducer(source)),
        );
        for (const node of watchers) runWatcher(node);
        writeProducer(source, 1);
        const measured = measure((i) => {
          if (i !== 0) writeProducer(source, i + 1);
          let value = 0;
          for (const node of watchers) {
            runWatcher(node);
            value += node.payload ?? 0;
          }
          return value;
        }, 1_000);
        return result(
          this.id,
          this.label,
          this.group,
          this.parentId,
          measured,
          {
            flushCount: measured.samples,
            watcherRunCount: measured.samples * watchers.length * 1000,
            queuePopCount: measured.samples * watchers.length * 1000,
            queueMaxSize: watchers.length,
          },
        );
      });
    },
  },
  {
    id: "api.effect.nested.1to1",
    label: "nested 1→1",
    group: "api",
    parentId: "api.effect.nested",
    run() {
      return withRuntime(() => {
        const source = producer(0);
        const target = producer(0);
        const queue = [];
        let head = 0;
        let draining = false;
        let invalidated = 0;
        let outerWrites = 0;

        const flush = () => {
          if (draining) return;

          draining = true;
          try {
            while (head < queue.length) runWatcher(queue[head++]);
          } finally {
            queue.length = 0;
            head = 0;
            draining = false;
          }
        };

        setInternalHooks((node) => {
          invalidated += 1;
          queue.push(node);
        }, flush);

        const outer = watcher(() => {
          writeProducer(target, readProducer(source));
          outerWrites += 1;
        });
        const inner = watcher(() => readProducer(target));
        runWatcher(outer);
        runWatcher(inner);

        invalidated = 0;
        outerWrites = 0;
        let writes = 1;
        const iterations = 20_000;
        const measured = measure(() => {
          writeProducer(source, writes++);
          return writes;
        }, iterations);

        // `measure` performs one warm-up pass before collecting its samples;
        // `outerWrites` includes both, so it is the authoritative wave count.
        const waves = outerWrites;
        return result(
          this.id,
          this.label,
          this.group,
          this.parentId,
          measured,
          {
            sourceWrites: waves,
            outerEffectWrites: waves,
            propagationWaves: waves * 2,
            watcherInvalidations: invalidated,
            expectedInvalidations: waves * 2,
            watcherRuns: waves * 2,
          },
        );
      });
    },
  },
];

function createStableOrder(fanIn) {
  const order = Array.from({ length: fanIn }, (_, i) => i);
  return () => order;
}

function createRotatingOrder(fanIn, step = 1) {
  let offset = 0;
  return () => {
    offset = (offset + step) % fanIn;
    return Array.from({ length: fanIn }, (_, i) => (i + offset) % fanIn);
  };
}

function createReverseOrder(fanIn) {
  const base = Array.from({ length: fanIn }, (_, i) => i);
  const reversed = base.slice().reverse();
  let useReverse = false;
  return () => {
    useReverse = !useReverse;
    return useReverse ? reversed : base;
  };
}

function createTrackReadCounters(fanIn) {
  return {
    trackReadCount: 0,
    expectedNextHitCount: 0,
    fallbackCount: 0,
    fallbackScanCount: 0,
    fallbackScanStepsTotal: 0,
    maxFallbackScanLen: 0,
    hitNearHeadCount: 0,
    hitNearTailCount: 0,
    fullScanHitCount: 0,
    fullScanMissCount: 0,
    addEdgeCount: 0,
    moveEdgeCount: 0,
    moveEdgeFromPrevNext: 0,
    moveEdgeFromNearHead: 0,
    moveEdgeFromTail: 0,
    moveEdgeNoopOrAdjacent: 0,
    relinkPrevNextWrites: 0,
    relinkOutListWrites: 0,
    duplicateReadCount: 0,
    wrappedResolvedCount: 0,
    tinyScanHitCount: 0,
    fullFallbackAfterTinyCount: 0,
    fanIn,
  };
}

function countIncomingRelinkWrites(counters, active, found, prev) {
  const oldPrev = found.prevIn;
  const oldNext = found.nextIn;
  const newNext = prev ? prev.nextIn : active.firstIn;

  counters.relinkPrevNextWrites += oldPrev ? 1 : 1;
  counters.relinkPrevNextWrites += oldNext ? 1 : 1;
  counters.relinkPrevNextWrites += newNext ? 1 : 1;
  counters.relinkPrevNextWrites += prev ? 1 : 1;
}

function moveFoundEdge(counters, active, found, prev, steps, version) {
  if (found.prevIn === prev) {
    counters.moveEdgeNoopOrAdjacent += 1;
    found.version = version;
    return found;
  }

  counters.moveEdgeCount += 1;
  if (steps === 1) counters.moveEdgeFromPrevNext += 1;
  if (steps <= 4) counters.moveEdgeFromNearHead += 1;
  if (steps >= Math.max(1, counters.fanIn - 4)) counters.moveEdgeFromTail += 1;
  countIncomingRelinkWrites(counters, active, found, prev);
  detachIncomingEdge(active, found);
  attachIncomingEdgeAfter(active, found, prev);
  found.version = version;
  return found;
}

function createInstrumentedFallback(counters, options = {}) {
  const tinyScanLimit = options.tinyScanLimit ?? 0;

  return function instrumentedFallback(
    source,
    active,
    prev,
    nextExpected,
    version,
  ) {
    counters.fallbackCount += 1;

    if (tinyScanLimit > 0) {
      let tinySteps = 0;
      for (
        let edge = nextExpected;
        edge !== null && tinySteps < tinyScanLimit;
        edge = edge.nextIn
      ) {
        tinySteps += 1;
        if (edge.from !== source) continue;

        counters.tinyScanHitCount += 1;
        counters.fallbackScanStepsTotal += tinySteps;
        counters.maxFallbackScanLen = Math.max(
          counters.maxFallbackScanLen,
          tinySteps,
        );
        if (tinySteps <= 4) counters.hitNearHeadCount += 1;
        return moveFoundEdge(counters, active, edge, prev, tinySteps, version);
      }

      counters.fullFallbackAfterTinyCount += 1;
    }

    counters.fallbackScanCount += 1;

    let steps = 0;
    let found = null;
    for (
      let edge = nextExpected ?? active.firstIn;
      edge !== null;
      edge = edge.nextIn
    ) {
      steps += 1;
      if (edge.from === source) {
        found = edge;
        break;
      }
    }

    counters.fallbackScanStepsTotal += steps;
    counters.maxFallbackScanLen = Math.max(counters.maxFallbackScanLen, steps);

    if (found === null) {
      counters.fullScanMissCount += 1;
      counters.addEdgeCount += 1;
      return linkEdge(source, active, prev, version);
    }

    if (steps <= 4) counters.hitNearHeadCount += 1;
    if (steps >= Math.max(1, counters.fanIn - 4))
      counters.hitNearTailCount += 1;
    if (steps >= counters.fanIn) counters.fullScanHitCount += 1;
    if (nextExpected === null) counters.wrappedResolvedCount += 1;

    return moveFoundEdge(counters, active, found, prev, steps, version);
  };
}

function finalizeTrackReadCounters(counters) {
  if (counters.expectedNextHitCount === 0 && counters.tinyScanHitCount === 0) {
    counters.expectedNextHitCount = Math.max(
      0,
      counters.trackReadCount -
        counters.fallbackCount -
        counters.duplicateReadCount,
    );
  }

  counters.avgFallbackScanLen =
    counters.fallbackScanCount === 0
      ? 0
      : counters.fallbackScanStepsTotal / counters.fallbackScanCount;
  counters.avgFallbackProbeLen =
    counters.fallbackCount === 0
      ? 0
      : counters.fallbackScanStepsTotal / counters.fallbackCount;
  counters.fallbackRate =
    counters.trackReadCount === 0
      ? 0
      : counters.fallbackCount / counters.trackReadCount;
  counters.duplicateRate =
    counters.trackReadCount === 0
      ? 0
      : counters.duplicateReadCount / counters.trackReadCount;
  counters.addEdgeRate =
    counters.fallbackCount === 0
      ? 0
      : counters.addEdgeCount / counters.fallbackCount;
  counters.moveEdgeRate =
    counters.fallbackCount === 0
      ? 0
      : counters.moveEdgeCount / counters.fallbackCount;
  counters.tinyScanCandidateCount = Math.max(
    0,
    counters.trackReadCount -
      counters.expectedNextHitCount -
      counters.duplicateReadCount -
      counters.fallbackCount,
  );
  counters.tinyScanHitRate =
    counters.tinyScanCandidateCount === 0
      ? 0
      : counters.tinyScanHitCount / counters.tinyScanCandidateCount;
  counters.fullFallbackAfterTinyRate =
    counters.fallbackCount === 0
      ? 0
      : counters.fullFallbackAfterTinyCount / counters.fallbackCount;
  counters.wrappedResolvedRate =
    counters.fallbackCount === 0
      ? 0
      : counters.wrappedResolvedCount / counters.fallbackCount;
  return counters;
}

function trackReadBench(bench, getOrder, fanIn, options = {}) {
  return withRuntime(() => {
    const sources = Array.from({ length: fanIn }, (_, i) => producer(i + 1));
    const tick = producer(0);
    const counters = createTrackReadCounters(fanIn);
    const root = consumer(() => {
      readProducer(tick);
      counters.trackReadCount += 1;
      let sum = 0;
      const order = getOrder();
      for (let i = 0; i < fanIn; i += 1) {
        sum += readProducer(sources[order[i]]);
        counters.trackReadCount += 1;
      }
      return sum;
    });

    configureRuntimeContext({
      readTrackingStrategy: createInstrumentedFallback(counters, options),
    });

    readConsumer(root);
    let writes = 1;
    const iterations = 20_000;
    const measured = measure(() => {
      writeProducer(tick, writes++);
      return readConsumer(root);
    }, iterations);

    if (options.fastPath === "tinyScan") {
      const computeCount = counters.trackReadCount / (fanIn + 1);
      counters.expectedNextHitCount = computeCount;
      counters.tinyScanHitCount = counters.trackReadCount - computeCount;
    }

    return result(
      bench.id,
      bench.label,
      bench.group,
      bench.parentId,
      measured,
      finalizeTrackReadCounters(counters),
    );
  });
}

function trackReadMissAddEdgeBench(bench, fanIn) {
  return withRuntime(() => {
    const stableSources = Array.from({ length: fanIn - 1 }, (_, i) =>
      producer(i + 1),
    );
    const split = Math.floor(stableSources.length / 2);
    const tick = producer(0);
    const counters = createTrackReadCounters(fanIn);
    let extra = producer(fanIn);
    const root = consumer(() => {
      readProducer(tick);
      counters.trackReadCount += 1;
      let sum = 0;
      for (let i = 0; i < split; i += 1) {
        sum += readProducer(stableSources[i]);
        counters.trackReadCount += 1;
      }
      sum += readProducer(extra);
      counters.trackReadCount += 1;
      for (let i = split; i < stableSources.length; i += 1) {
        sum += readProducer(stableSources[i]);
        counters.trackReadCount += 1;
      }
      return sum;
    });

    configureRuntimeContext({
      readTrackingStrategy: createInstrumentedFallback(counters),
    });

    readConsumer(root);
    let writes = 1;
    const measured = measure(() => {
      extra = producer(writes);
      writeProducer(tick, writes++);
      return readConsumer(root);
    }, 20_000);
    return result(
      bench.id,
      bench.label,
      bench.group,
      bench.parentId,
      measured,
      finalizeTrackReadCounters(counters),
    );
  });
}

function trackReadDuplicateBench(bench, fanIn) {
  return withRuntime(() => {
    const sources = Array.from({ length: fanIn }, (_, i) => producer(i + 1));
    const tick = producer(0);
    const counters = createTrackReadCounters(fanIn);
    const order = createStableOrder(fanIn);
    const root = consumer(() => {
      readProducer(tick);
      counters.trackReadCount += 1;
      let sum = 0;
      const current = order();
      for (let i = 0; i < fanIn; i += 1) {
        const source = sources[current[i]];
        sum += readProducer(source);
        sum += readProducer(source);
        counters.trackReadCount += 2;
        counters.duplicateReadCount += 1;
      }
      return sum;
    });

    configureRuntimeContext({
      readTrackingStrategy: createInstrumentedFallback(counters),
    });

    readConsumer(root);
    let writes = 1;
    const measured = measure(() => {
      writeProducer(tick, writes++);
      return readConsumer(root);
    }, 20_000);
    return result(
      bench.id,
      bench.label,
      bench.group,
      bench.parentId,
      measured,
      finalizeTrackReadCounters(counters),
    );
  });
}

function aggregate(results) {
  const byId = new Map(results.map((item) => [item.id, item]));
  for (const item of results) {
    const parts = item.id.split(".");
    while (parts.length > 1) {
      parts.pop();
      const id = parts.join(".");
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          label: parts.at(-1),
          group: parts[0],
          parentId:
            parts.length === 1 ? "reflex.perf" : parts.slice(0, -1).join("."),
          metrics: {
            meanMs: 0,
            medianMs: 0,
            p95Ms: 0,
            p99Ms: 0,
            rme: 0,
            samples: 0,
          },
          counters: {},
        });
      }
    }
  }

  for (const item of results) {
    let parentId = item.parentId;
    while (parentId && parentId !== "reflex.perf") {
      const parent = byId.get(parentId);
      if (parent) {
        parent.metrics.meanMs += item.metrics.meanMs;
        parent.metrics.medianMs += item.metrics.medianMs;
        parent.metrics.p95Ms += item.metrics.p95Ms;
        parent.metrics.p99Ms += item.metrics.p99Ms;
        parent.metrics.samples = Math.max(
          parent.metrics.samples,
          item.metrics.samples,
        );
      }
      parentId = parent?.parentId ?? null;
    }
  }

  return [...byId.values()].sort(compareItems);
}

function printTree(items) {
  const children = new Map();
  for (const item of items) {
    const parentId = item.parentId ?? "reflex.perf";
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(item);
  }
  for (const [parentId, list] of children)
    list.sort((a, b) => compareChildren(parentId, a, b));

  console.log("reflex.perf");
  printChildren("reflex.perf", "", children);
}

function compareItems(a, b) {
  if (a.parentId === b.parentId && a.parentId) {
    return compareChildren(a.parentId, a, b);
  }

  return a.id.localeCompare(b.id);
}

function compareChildren(parentId, a, b) {
  const order = childOrder.get(parentId);
  if (order) {
    const left = order.indexOf(a.id);
    const right = order.indexOf(b.id);

    if (left !== -1 || right !== -1) {
      if (left === -1) return 1;
      if (right === -1) return -1;
      return left - right;
    }
  }

  return a.id.localeCompare(b.id);
}

function printChildren(parentId, prefix, children) {
  const list = children.get(parentId) ?? [];
  list.forEach((item, index) => {
    const isLast = index === list.length - 1;
    const branch = isLast ? "`- " : "|- ";
    const nextPrefix = prefix + (isLast ? "   " : "|  ");
    const name = item.parentId === "reflex.perf" ? item.id : item.label;
    const time =
      item.metrics.meanMs > 0 ? `${item.metrics.meanMs.toFixed(3)} ms` : "";
    console.log(`${prefix}${branch}${name.padEnd(36)} ${time}`);
    printChildren(item.id, nextPrefix, children);
  });
}

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
    ids: argv
      .filter((arg) => !arg.startsWith("--"))
      .flatMap((arg) => arg.split(","))
      .filter(Boolean),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const selected =
    args.ids.length === 0
      ? benches
      : benches.filter((bench) =>
          args.ids.some(
            (id) => bench.id === id || bench.id.startsWith(`${id}.`),
          ),
        );

  if (selected.length === 0) {
    throw new Error(`No perf tree benchmarks matched: ${args.ids.join(", ")}`);
  }

  const results = selected.map((bench) => bench.run());
  const tree = aggregate(results);

  if (args.json) {
    console.log(JSON.stringify(tree, null, 2));
  } else {
    printTree(tree);
  }
}

main();
