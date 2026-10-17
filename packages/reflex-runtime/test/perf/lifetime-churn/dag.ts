import {
  createConsumer,
  createProducer,
  createWatcher,
  disposeNode,
  disposeWatcher,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
  type ConsumerNode,
  type ProducerNode,
  type WatcherNode,
} from "../../../src/internal";
import {
  censusGraph,
  fullGc,
  heapUsed,
  installQueueScheduler,
  observedSet,
  probeWrites,
  prng,
  type GraphCensus,
  type Node,
  type WriteCost,
} from "./harness";

/**
 * Experiment C: shared dependencies.
 *
 * A layered DAG of shared computeds is observed by many watchers; watchers
 * are then removed in a fixed random order. Watchers model component effects,
 * so disposing them is exactly what an ownership lifecycle provides. The
 * shared computeds belong to a long-lived owner and are never disposed by
 * lifecycle.
 *
 * Variants (same seed, same graph, same removal order):
 * - "retain":       only watchers are disposed (= what lifecycle solves).
 * - "oracle-prune": after each step, every computed that no live watcher can
 *                   reach is disposed. Not an algorithm proposal: it is the
 *                   lower bound any graph-level unobserved-detachment scheme
 *                   could reach.
 */

export type DagVariant = "retain" | "oracle-prune";

export interface DagOptions {
  variant: DagVariant;
  seed: number;
  producers: number;
  layers: number;
  width: number;
  fanIn: number;
  watchers: number;
  readsPerWatcher: number;
  removalSteps: number;
  probeWrites: number;
}

export interface DagCheckpoint {
  step: number;
  liveWatchers: number;
  heapBytes: number;
  /** Max live heap (after GC) observed up to and including this step. */
  peakHeapBytes: number;
  graph: GraphCensus;
  /** Nodes pruned by the oracle in this step (0 for "retain"). */
  pruned: number;
  write: WriteCost;
}

export interface DagResult {
  experiment: "C";
  options: DagOptions;
  baselineHeapBytes: number;
  buildHeapBytes: number;
  checkpoints: DagCheckpoint[];
}

export async function runDag(options: DagOptions): Promise<DagResult> {
  installQueueScheduler();
  const random = prng(options.seed);
  const pick = <T>(items: readonly T[]) =>
    items[Math.floor(random() * items.length)]!;

  await fullGc();
  const baselineHeapBytes = heapUsed();
  let peak = 0;

  // ------------------------------------------------------------ build
  const producers: ProducerNode<number>[] = Array.from(
    { length: options.producers },
    (_, i) => createProducer(i),
  );
  const layers: ConsumerNode<number>[][] = [];
  for (let layer = 0; layer < options.layers; layer++) {
    const nodes: ConsumerNode<number>[] = [];
    for (let i = 0; i < options.width; i++) {
      if (layer === 0) {
        const sources = Array.from({ length: options.fanIn }, () =>
          pick(producers),
        );
        nodes.push(
          createConsumer(() => {
            let sum = 0;
            for (const source of sources) sum += readProducer(source);
            return sum;
          }),
        );
      } else {
        const previous = layers[layer - 1]!;
        const sources = Array.from({ length: options.fanIn }, () =>
          pick(previous),
        );
        nodes.push(
          createConsumer(() => {
            let sum = 0;
            for (const source of sources) sum += readConsumer(source);
            return sum % 1_000_003;
          }),
        );
      }
    }
    layers.push(nodes);
  }

  const top = layers[layers.length - 1]!;
  const all = layers.flat();
  let sink = 0;
  const order: (WatcherNode | null)[] = [];
  for (let w = 0; w < options.watchers; w++) {
    // Mostly the top layer, one read anywhere in the DAG.
    const reads = Array.from({ length: options.readsPerWatcher }, (_, r) =>
      r === 0 ? pick(all) : pick(top),
    );
    const watcher = createWatcher(() => {
      for (const node of reads) sink += readConsumer(node);
    });
    runWatcher(watcher);
    order.push(watcher);
  }

  // Removal order: a seeded Fisher-Yates permutation.
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }

  const live = new Set<Node>(order as Node[]);
  const disposed = new Set<Node>();
  const roots = producers as Node[];
  let writeValue = 0;
  const probeStep = () => {
    writeValue++;
    writeProducer(pick(producers), -writeValue);
  };

  const prune = (): number => {
    if (options.variant !== "oracle-prune") return 0;
    const observed = observedSet(live);
    let pruned = 0;
    // Downstream first is not required for correctness (disposeNode unlinks
    // both directions), but mirrors how a refcount cascade would proceed.
    for (let layer = layers.length - 1; layer >= 0; layer--) {
      for (const node of layers[layer]! as Node[]) {
        if (observed.has(node) || disposed.has(node)) continue;
        // Never-read computeds hold no edges; disposing them is free.
        if (node.firstIn !== null || node.firstOut !== null) pruned++;
        disposeNode(node);
        disposed.add(node);
      }
    }
    return pruned;
  };

  const checkpoints: DagCheckpoint[] = [];
  // Warm the write/flush path so JIT code is not attributed to the graph.
  probeWrites(options.probeWrites, probeStep);
  await fullGc();
  const buildHeapBytes = heapUsed() - baselineHeapBytes;

  async function checkpoint(step: number, pruned: number) {
    await fullGc();
    const heapBytes = heapUsed() - baselineHeapBytes;
    peak = Math.max(peak, heapBytes);
    const observed = observedSet(live);
    const graph = censusGraph(
      roots,
      (node) => node.compute !== undefined && !observed.has(node),
    );
    const write = probeWrites(options.probeWrites, probeStep);
    checkpoints.push({
      step,
      liveWatchers: live.size,
      heapBytes,
      peakHeapBytes: peak,
      graph,
      pruned,
      write,
    });
  }

  await checkpoint(0, 0);
  const perStep = Math.ceil(order.length / options.removalSteps);
  for (let step = 1; step <= options.removalSteps; step++) {
    const batch = order.slice((step - 1) * perStep, step * perStep);
    for (const watcher of batch) {
      disposeWatcher(watcher!);
      live.delete(watcher as Node);
    }
    order.fill(null, (step - 1) * perStep, step * perStep);
    const pruned = prune();
    await checkpoint(step, pruned);
  }

  if (sink === Number.MIN_VALUE) console.log(sink);

  return {
    experiment: "C",
    options,
    baselineHeapBytes,
    buildHeapBytes,
    checkpoints,
  };
}
