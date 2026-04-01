import { performance } from "node:perf_hooks";
import { getDefaultContext } from "../../build/esm/reactivity/context.js";
import {
  CONSUMER_CHANGED,
  DIRTY_STATE,
  PRODUCER_INITIAL_STATE,
  ReactiveNodeState,
  WALKER_STATE,
} from "../../build/esm/reactivity/shape/ReactiveMeta.js";
import { UNINITIALIZED } from "../../build/esm/reactivity/shape/ReactiveNode.js";
import ReactiveNode from "../../build/esm/reactivity/shape/ReactiveNode.js";
import { linkEdge } from "../../build/esm/reactivity/shape/methods/connect.js";
import { propagate as propagateImported } from "../../build/esm/reactivity/walkers/propagate.js";

const runtime = getDefaultContext();

const DIRTY_OR_WALKER =
  ReactiveNodeState.Invalid |
  ReactiveNodeState.Changed |
  ReactiveNodeState.Visited |
  ReactiveNodeState.Tracking;
const TRACKING_CONSUMER_STATE =
  ReactiveNodeState.Consumer | ReactiveNodeState.Tracking;
const NON_IMMEDIATE = 0;
const IMMEDIATE = 1;
const INVALIDATION_SLOW_PATH_MASK =
  DIRTY_STATE | ReactiveNodeState.Disposed | WALKER_STATE;

function createProducer(value) {
  return new ReactiveNode(value, null, PRODUCER_INITIAL_STATE);
}

function createConsumer(compute) {
  return new ReactiveNode(UNINITIALIZED, compute, CONSUMER_CHANGED);
}

function resetRuntime() {
  runtime.resetState();
  runtime.setHooks({});
}

function clearWalkerState(nodes) {
  for (let i = 0; i < nodes.length; i += 1) {
    nodes[i].state &= ~DIRTY_OR_WALKER;
  }
}

function isTrackedPrefixEdge(edge, depsTail) {
  if (depsTail === null) return false;
  if (edge === depsTail) return true;
  for (let cursor = edge.prevIn; cursor !== null; cursor = cursor.prevIn) {
    if (cursor === depsTail) return false;
  }
  return true;
}

function getSlowInvalidatedSubscriberState(edge, state, promoteImmediate) {
  if ((state & (DIRTY_STATE | ReactiveNodeState.Disposed)) !== 0) return 0;

  if ((state & ReactiveNodeState.Tracking) === 0) {
    return (
      (state & ~ReactiveNodeState.Visited) |
      (promoteImmediate ? ReactiveNodeState.Changed : ReactiveNodeState.Invalid)
    );
  }

  return isTrackedPrefixEdge(edge, edge.to.depsTail)
    ? state | ReactiveNodeState.Visited | ReactiveNodeState.Invalid
    : 0;
}

function notifyWatcherInvalidation(node, thrown, context) {
  const onEffectInvalidated = context.onEffectInvalidatedHook;
  if (onEffectInvalidated === undefined) return thrown;

  try {
    onEffectInvalidated(node);
  } catch (error) {
    return thrown ?? error;
  }

  return thrown;
}

function createPropagateArrayVariant() {
  const edgeStack = [];
  const promoteStack = [];

  function propagateBranching(
    edge,
    promote,
    resume,
    resumePromote,
    thrown,
    context,
  ) {
    const stackBase = edgeStack.length;
    let stackTop = stackBase;

    try {
      while (true) {
        const sub = edge.to;
        const state = sub.state;
        const nextState =
          (state & INVALIDATION_SLOW_PATH_MASK) === 0
            ? state |
              (promote ? ReactiveNodeState.Changed : ReactiveNodeState.Invalid)
            : getSlowInvalidatedSubscriberState(edge, state, promote);

        if (nextState !== 0) {
          sub.state = nextState;

          if ((nextState & ReactiveNodeState.Watcher) !== 0) {
            thrown = notifyWatcherInvalidation(sub, thrown, context);
          } else {
            const firstOut = sub.firstOut;
            if (firstOut !== null) {
              if (resume !== null) {
                edgeStack[stackTop] = resume;
                promoteStack[stackTop++] = resumePromote;
              }
              edge = firstOut;
              resume = edge.nextOut;
              promote = resumePromote = NON_IMMEDIATE;
              continue;
            }
          }
        }

        if (resume !== null) {
          edge = resume;
          promote = resumePromote;
          resume = edge.nextOut;
        } else if (stackTop > stackBase) {
          --stackTop;
          edge = edgeStack[stackTop];
          promote = resumePromote = promoteStack[stackTop];
          resume = edge.nextOut;
        } else {
          return thrown;
        }
      }
    } finally {
      edgeStack.length = stackBase;
      promoteStack.length = stackBase;
    }
  }

  function propagateLinear(edge, promote, thrown, context) {
    while (true) {
      const sub = edge.to;
      const state = sub.state;
      const nextState =
        (state & INVALIDATION_SLOW_PATH_MASK) === 0
          ? state |
            (promote ? ReactiveNodeState.Changed : ReactiveNodeState.Invalid)
          : getSlowInvalidatedSubscriberState(edge, state, promote);
      const next = edge.nextOut;

      if (nextState !== 0) {
        sub.state = nextState;

        if ((nextState & ReactiveNodeState.Watcher) !== 0) {
          thrown = notifyWatcherInvalidation(sub, thrown, context);
        } else {
          const firstOut = sub.firstOut;
          if (firstOut !== null) {
            edge = firstOut;
            if (next !== null) {
              return propagateBranching(
                edge,
                NON_IMMEDIATE,
                next,
                promote,
                thrown,
                context,
              );
            }
            promote = NON_IMMEDIATE;
            continue;
          }
        }
      }

      if (next === null) return thrown;
      edge = next;
    }
  }

  return function propagateArrayVariant(
    startEdge,
    promoteImmediate = NON_IMMEDIATE,
    context = runtime,
  ) {
    if ((startEdge.from.state & ReactiveNodeState.Disposed) !== 0) return;

    const thrown = propagateLinear(startEdge, promoteImmediate, null, context);
    if (thrown !== null) throw thrown;
  };
}

function createPropagateInt32Variant() {
  const edgeStack = [];
  let promoteStack = new Int32Array(16);

  function ensurePromoteCapacity(index) {
    if (index < promoteStack.length) return;

    let nextLength = promoteStack.length;
    while (nextLength <= index) nextLength <<= 1;

    const next = new Int32Array(nextLength);
    next.set(promoteStack);
    promoteStack = next;
  }

  function propagateBranching(
    edge,
    promote,
    resume,
    resumePromote,
    thrown,
    context,
  ) {
    const stackBase = edgeStack.length;
    let stackTop = stackBase;

    try {
      while (true) {
        const sub = edge.to;
        const state = sub.state;
        const nextState =
          (state & INVALIDATION_SLOW_PATH_MASK) === 0
            ? state |
              (promote ? ReactiveNodeState.Changed : ReactiveNodeState.Invalid)
            : getSlowInvalidatedSubscriberState(edge, state, promote);

        if (nextState !== 0) {
          sub.state = nextState;

          if ((nextState & ReactiveNodeState.Watcher) !== 0) {
            thrown = notifyWatcherInvalidation(sub, thrown, context);
          } else {
            const firstOut = sub.firstOut;
            if (firstOut !== null) {
              if (resume !== null) {
                edgeStack[stackTop] = resume;
                ensurePromoteCapacity(stackTop);
                promoteStack[stackTop++] = resumePromote;
              }
              edge = firstOut;
              resume = edge.nextOut;
              promote = resumePromote = NON_IMMEDIATE;
              continue;
            }
          }
        }

        if (resume !== null) {
          edge = resume;
          promote = resumePromote;
          resume = edge.nextOut;
        } else if (stackTop > stackBase) {
          --stackTop;
          edge = edgeStack[stackTop];
          promote = resumePromote = promoteStack[stackTop];
          resume = edge.nextOut;
        } else {
          return thrown;
        }
      }
    } finally {
      edgeStack.length = stackBase;
    }
  }

  function propagateLinear(edge, promote, thrown, context) {
    while (true) {
      const sub = edge.to;
      const state = sub.state;
      const nextState =
        (state & INVALIDATION_SLOW_PATH_MASK) === 0
          ? state |
            (promote ? ReactiveNodeState.Changed : ReactiveNodeState.Invalid)
          : getSlowInvalidatedSubscriberState(edge, state, promote);
      const next = edge.nextOut;

      if (nextState !== 0) {
        sub.state = nextState;

        if ((nextState & ReactiveNodeState.Watcher) !== 0) {
          thrown = notifyWatcherInvalidation(sub, thrown, context);
        } else {
          const firstOut = sub.firstOut;
          if (firstOut !== null) {
            edge = firstOut;
            if (next !== null) {
              return propagateBranching(
                edge,
                NON_IMMEDIATE,
                next,
                promote,
                thrown,
                context,
              );
            }
            promote = NON_IMMEDIATE;
            continue;
          }
        }
      }

      if (next === null) return thrown;
      edge = next;
    }
  }

  return function propagateInt32Variant(
    startEdge,
    promoteImmediate = NON_IMMEDIATE,
    context = runtime,
  ) {
    if ((startEdge.from.state & ReactiveNodeState.Disposed) !== 0) return;

    const thrown = propagateLinear(startEdge, promoteImmediate, null, context);
    if (thrown !== null) throw thrown;
  };
}

const propagateArrayLocal = createPropagateArrayVariant();
const propagateInt32Local = createPropagateInt32Variant();

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
    run(propagateImpl) {
      propagateImpl(startEdge, IMMEDIATE, runtime);
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
    run(propagateImpl) {
      propagateImpl(startEdge, IMMEDIATE, runtime);
      clearWalkerState(nodes);
      return nodes.length;
    },
  };
}

function buildPropagateTree(branching, depth) {
  resetRuntime();

  const root = createProducer(0);
  const nodes = [];

  function build(parent, level) {
    if (level === depth) return;

    for (let i = 0; i < branching; i += 1) {
      const node = createConsumer(() => level + i);
      nodes.push(node);
      linkEdge(parent, node);
      build(node, level + 1);
    }
  }

  build(root, 0);

  const startEdge = root.firstOut;
  if (startEdge === null) throw new Error("propagate tree root has no edge");

  return {
    run(propagateImpl) {
      propagateImpl(startEdge, IMMEDIATE, runtime);
      clearWalkerState(nodes);
      return nodes.length;
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
        linkEdge(parent, child);
        trackingReject.push({ node: child, depsTail: prefixEdge });
        parent = child;
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
      entry.node.depsTail = entry.depsTail;
    }

    for (let i = 0; i < trackingReject.length; i += 1) {
      const entry = trackingReject[i];
      entry.node.state = TRACKING_CONSUMER_STATE;
      entry.node.depsTail = entry.depsTail;
    }
  }

  return {
    run(propagateImpl) {
      armTracking();
      propagateImpl(startEdge, IMMEDIATE, runtime);
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

function measure(fn, iterations) {
  if (globalThis.gc) globalThis.gc();

  let sink = 0;
  const start = performance.now();

  for (let i = 0; i < iterations; i += 1) {
    sink ^= fn(i) & 1;
  }

  const elapsedMs = performance.now() - start;
  return {
    nsPerOp: (elapsedMs * 1e6) / iterations,
    sink,
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length / 2) | 0];
}

function formatDelta(candidate, baseline) {
  const delta = ((candidate - baseline) / baseline) * 100;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

function runScenario(label, scenario, iterations, warmup = iterations >> 1, rounds = 7) {
  const variants = [
    ["imported", () => scenario.run(propagateImported)],
    ["array_local", () => scenario.run(propagateArrayLocal)],
    ["int32_local", () => scenario.run(propagateInt32Local)],
  ];
  const samples = new Map();

  for (const [name, fn] of variants) {
    warm(fn, warmup);
    samples.set(name, []);
  }

  for (let round = 0; round < rounds; round += 1) {
    const order = round % 3;
    for (let offset = 0; offset < variants.length; offset += 1) {
      const [name, fn] = variants[(order + offset) % variants.length];
      const result = measure(fn, iterations);
      samples.get(name).push(result.nsPerOp);
    }
  }

  const importedMedian = median(samples.get("imported"));
  const arrayMedian = median(samples.get("array_local"));
  const int32Median = median(samples.get("int32_local"));

  console.log(`\n${label}`);
  console.log(
    `  imported:    ${importedMedian.toFixed(1)} ns/op`,
  );
  console.log(
    `  array_local: ${arrayMedian.toFixed(1)} ns/op (${formatDelta(
      arrayMedian,
      importedMedian,
    )} vs imported)`,
  );
  console.log(
    `  int32_local: ${int32Median.toFixed(1)} ns/op (${formatDelta(
      int32Median,
      arrayMedian,
    )} vs array_local)`,
  );
}

function main() {
  runScenario("propagate_chain_64", buildPropagateChain(64), 200000);
  runScenario("propagate_fanout_32x8", buildPropagateFanout(32, 8), 100000);
  runScenario("propagate_tree_4x5", buildPropagateTree(4, 5), 20000, 10000);
  runScenario("propagate_tree_4x6", buildPropagateTree(4, 6), 5000, 2500);
  runScenario(
    "propagate_branching_tracking_mix_32x8",
    buildPropagateBranchingTrackingMix(32, 8),
    100000,
    50000,
  );
}

main();
