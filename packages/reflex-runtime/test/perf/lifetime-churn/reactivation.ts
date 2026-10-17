import { performance } from "node:perf_hooks";

import {
  createConsumer,
  createProducer,
  createWatcher,
  disposeNode,
  disposeWatcher,
  linkEdge,
  readConsumer,
  readProducer,
  runWatcher,
  unlinkAllSources,
  writeProducer,
  type ConsumerNode,
  type ProducerNode,
  type WatcherNode,
} from "../../../src/internal";
import { Both, Changed } from "../../../src/kernel/shape";
import {
  readRuntimeProfileCounters,
  resetRuntimeProfileCounters,
  setRuntimeProfilingEnabled,
} from "../../../src/profiling";
import {
  censusGraph,
  flush,
  fullGc,
  heapUsed,
  installQueueScheduler,
  prng,
  type Node,
} from "./harness";

/**
 * Experiment D: deactivate → W writes → reactivate.
 *
 * The DAG has two regions with identical shape. Region A is observed for the
 * whole run. Region B is observed by "toggle" watchers that are disposed
 * (deactivate) and later recreated over the same computed handles
 * (reactivate). Shared producers feed both regions; foreign producers feed
 * only A, so a write mix decides whether sleeping B is touched at all.
 *
 * Variants of what happens to B's computeds while unobserved:
 * - retain:               nothing (current Reflex behaviour).
 * - suspend-conservative: unlink B's sources and mark B Changed; reactivation
 *                         recomputes and re-tracks everything. Correct without
 *                         any freshness knowledge.
 * - suspend-oracle:       unlink B's sources but remember them; reactivation
 *                         relinks the same edges and forces recompute only on
 *                         nodes whose transitive producers were written while
 *                         suspended. Models a perfect version-vector check at
 *                         zero bookkeeping cost: an upper bound for suspension.
 * - dispose-recreate:     dispose B and build fresh computeds on reactivation
 *                         (only legal when lifecycle allows it: handle and
 *                         result identity change).
 *
 * The suspension variants manipulate kernel fields from the harness only; no
 * runtime source changes. Every reactivation is checked against a plain-JS
 * reference evaluation of the whole DAG.
 */

export type ReactivationVariant =
  | "retain"
  | "suspend-conservative"
  | "suspend-oracle"
  | "dispose-recreate";

export type WriteMix = "shared" | "foreign";

export interface ReactivationOptions {
  variant: ReactivationVariant;
  mix: WriteMix;
  sleepWrites: number;
  seed: number;
  sharedProducers: number;
  foreignProducers: number;
  layers: number;
  /** Computeds per region per layer. */
  width: number;
  fanIn: number;
  /** Watchers per region. */
  watchers: number;
  readsPerWatcher: number;
  cycles: number;
}

export interface PhaseCost {
  ns: number;
  pushEdges: number;
  pullEdges: number;
  computes: number;
  watcherRuns: number;
  /** Net edge objects created (census delta). */
  edgesCreated: number;
  /** Edges removed from the graph. */
  edgesRemoved: number;
}

export interface ReactivationResult {
  experiment: "D";
  options: ReactivationOptions;
  /** Means over measured cycles. */
  deactivate: PhaseCost;
  sleep: PhaseCost;
  reactivate: PhaseCost;
  /** pushEdges + pullEdges + computes + edgesCreated + edgesRemoved, all phases. */
  totalWork: number;
  totalNs: number;
  /** Post-GC heap while B sleeps, relative to the post-build baseline. */
  sleepingHeapBytes: number;
  /** Max post-GC heap over all checkpoints. */
  peakHeapBytes: number;
  /** Edges into/inside B while it sleeps. */
  sleepingRegionEdges: number;
  /** Share of B's top-layer results whose payload object survived the cycle. */
  resultIdentityKept: number;
  /** Edges into/inside B once active again; min = max unless edges leak. */
  activeRegionEdges: { min: number; max: number };
  /** Values checked against the reference evaluation (all must match). */
  checkedValues: number;
  mismatches: number;
}

type Top = { v: number };

export async function runReactivation(
  options: ReactivationOptions,
): Promise<ReactivationResult> {
  installQueueScheduler();
  const random = prng(options.seed);
  const pickIndex = (n: number) => Math.floor(random() * n);
  const { layers, width, fanIn } = options;
  const top = layers - 1;

  // ------------------------------------------------------------ spec
  const producerCount = options.sharedProducers + options.foreignProducers;
  const isShared = (p: number) => p < options.sharedProducers;
  // spec[region][layer][i] = parent indices (producers at layer 0, else the
  // previous layer of the same region).
  const spec: number[][][][] = [0, 1].map((region) =>
    Array.from({ length: layers }, (_, layer) =>
      Array.from({ length: width }, () =>
        Array.from({ length: fanIn }, () =>
          layer > 0
            ? pickIndex(width)
            : region === 1
              ? pickIndex(options.sharedProducers)
              : pickIndex(producerCount),
        ),
      ),
    ),
  );
  const readSpec: number[][][] = [0, 1].map(() =>
    Array.from({ length: options.watchers }, (_, w) =>
      Array.from({ length: options.readsPerWatcher }, (_, r) =>
        r === 0 && w % 2 === 1 ? -1 - pickIndex(width) : pickIndex(width),
      ),
    ),
  );
  // Transitive shared-producer mask of each region-B node.
  const maskB: number[][] = [];
  for (let layer = 0; layer < layers; layer++) {
    maskB.push(
      spec[1]![layer]!.map((parents) =>
        parents.reduce(
          (mask, p) => mask | (layer === 0 ? 1 << p : maskB[layer - 1]![p]!),
          0,
        ),
      ),
    );
  }

  // ------------------------------------------------------------ build
  await fullGc();
  const baselineHeapBytes = heapUsed();
  const producers: ProducerNode<number>[] = Array.from(
    { length: producerCount },
    (_, p) => createProducer(p + 1),
  );
  // nodes[region][layer][i]; computes resolve parents through this table so
  // dispose-recreate can swap handles.
  const nodes: ConsumerNode<number | Top>[][][] = [[], []];
  const makeNode = (region: number, layer: number, i: number) => {
    const parents = spec[region]![layer]![i]!;
    const salt = region * 7919 + layer * 131 + i;
    const finish =
      layer === top
        ? (sum: number): Top => ({ v: sum % 1_000_003 })
        : (sum: number) => sum % 1_000_003;
    return createConsumer<number | Top>(
      layer === 0
        ? () => {
            let sum = salt;
            for (const p of parents) sum += readProducer(producers[p]!);
            return finish(sum);
          }
        : () => {
            const previous = nodes[region]![layer - 1]!;
            let sum = salt;
            for (const p of parents)
              sum += readConsumer(previous[p]!) as number;
            return finish(sum);
          },
    );
  };
  const buildRegion = (region: number) => {
    nodes[region] = Array.from({ length: layers }, (_, layer) =>
      Array.from({ length: width }, (_, i) => makeNode(region, layer, i)),
    );
  };
  buildRegion(0);
  buildRegion(1);

  let sink = 0;
  const readTarget = (region: number, ref: number) =>
    ref < 0
      ? (readConsumer(nodes[region]![top - 1]![-1 - ref]!) as number)
      : (readConsumer(nodes[region]![top]![ref]!) as Top).v;
  const makeWatchers = (region: number) =>
    readSpec[region]!.map((refs) => {
      const watcher = createWatcher(() => {
        for (const ref of refs) sink += readTarget(region, ref);
      });
      runWatcher(watcher);
      return watcher;
    });
  makeWatchers(0);
  let toggle: WatcherNode[] = makeWatchers(1);
  const roots = producers as Node[];

  // ------------------------------------------------------------ reference
  const reference = () => {
    const values = [0, 1].map((region) => {
      const table: number[][] = [];
      for (let layer = 0; layer < layers; layer++) {
        table.push(
          spec[region]![layer]!.map((parents, i) => {
            let sum = region * 7919 + layer * 131 + i;
            for (const p of parents)
              sum +=
                layer === 0
                  ? (producers[p]!.payload as number)
                  : table[layer - 1]![p]!;
            return sum % 1_000_003;
          }),
        );
      }
      return table;
    });
    return values;
  };

  // ------------------------------------------------------------ phases
  let writeValue = 0;
  const written = { mask: 0 };
  const writeOnce = () => {
    writeValue++;
    const p =
      options.mix === "shared"
        ? pickIndex(options.sharedProducers)
        : options.sharedProducers + pickIndex(options.foreignProducers);
    if (isShared(p)) written.mask |= 1 << p;
    writeProducer(producers[p]!, 1_000 + writeValue);
    flush();
  };

  const flatB = () => nodes[1]!.flat() as Node[];
  const regionEdges = () => {
    let count = 0;
    for (const node of flatB())
      for (let e = node.firstIn; e !== null; e = e.nextIn) count++;
    return count;
  };
  let saved: Map<Node, { sources: Node[]; state: number }> = new Map();

  const suspend = () => {
    switch (options.variant) {
      case "retain":
        return;
      case "suspend-conservative":
        for (const node of flatB()) {
          unlinkAllSources(node);
          node.state = (node.state & ~Both) | Changed;
        }
        return;
      case "suspend-oracle":
        saved = new Map();
        for (const node of flatB()) {
          const sources: Node[] = [];
          for (let e = node.firstIn; e !== null; e = e.nextIn)
            sources.push(e.from);
          saved.set(node, { sources, state: node.state });
        }
        for (const node of flatB()) unlinkAllSources(node);
        written.mask = 0;
        return;
      case "dispose-recreate":
        for (const node of flatB()) disposeNode(node);
        return;
    }
  };

  const resume = () => {
    switch (options.variant) {
      case "suspend-oracle":
        // Upstream first so an affected parent is linked before its children.
        for (let layer = 0; layer < layers; layer++) {
          nodes[1]![layer]!.forEach((consumer, i) => {
            const node = consumer as Node;
            const entry = saved.get(node)!;
            for (const source of entry.sources) linkEdge(source, node);
            // Post-compute invariant: the tracked tail covers every source.
            node.tailIn = node.lastIn;
            node.state =
              (maskB[layer]![i]! & written.mask) !== 0
                ? (entry.state & ~Both) | Changed
                : entry.state;
          });
        }
        saved = new Map();
        return;
      case "dispose-recreate":
        buildRegion(1);
        return;
      default:
        return;
    }
  };

  const measure = (fn: () => void): PhaseCost => {
    const edgesBefore = censusGraph(roots, () => false).edges;
    resetRuntimeProfileCounters();
    setRuntimeProfilingEnabled(true);
    const start = performance.now();
    fn();
    const ns = (performance.now() - start) * 1e6;
    setRuntimeProfilingEnabled(false);
    const c = readRuntimeProfileCounters();
    const delta = censusGraph(roots, () => false).edges - edgesBefore;
    return {
      ns,
      pushEdges: c.pushDirectEdgesVisited + c.pushTransitiveEdgesVisited,
      pullEdges: c.pullEdgesVisited + c.watcherFrontierEdgesVisited,
      computes: c.advanceComputeRuns,
      watcherRuns: c.watcherExecutions,
      edgesCreated: Math.max(0, delta),
      edgesRemoved: Math.max(0, -delta),
    };
  };

  const zero = (): PhaseCost => ({
    ns: 0,
    pushEdges: 0,
    pullEdges: 0,
    computes: 0,
    watcherRuns: 0,
    edgesCreated: 0,
    edgesRemoved: 0,
  });
  const add = (into: PhaseCost, from: PhaseCost) => {
    for (const key of Object.keys(into) as (keyof PhaseCost)[])
      into[key] += from[key];
  };
  const sums = { deactivate: zero(), sleep: zero(), reactivate: zero() };

  let peak = 0;
  let sleepingHeap = 0;
  let sleepingRegionEdges = 0;
  let identityKept = 0;
  let identityTotal = 0;
  let checked = 0;
  let mismatches = 0;
  const activeEdges = { min: Infinity, max: -Infinity };

  // Warm-up: every computed is read once (an owned computed that has been
  // used), both regions settle, then one unmeasured cycle runs.
  for (const node of nodes.flat(2)) readConsumer(node);
  for (let i = 0; i < 8; i++) writeOnce();

  for (let cycle = 0; cycle <= options.cycles; cycle++) {
    const measured = cycle > 0;
    const topBefore = nodes[1]![top]!.map((node) => node.payload);

    // Deactivate: the lifecycle part (watchers) is common to all variants.
    const deactivate = measure(() => {
      for (const watcher of toggle) disposeWatcher(watcher);
      toggle = [];
      suspend();
    });
    const sleep = measure(() => {
      for (let i = 0; i < options.sleepWrites; i++) writeOnce();
    });
    await fullGc();
    const heapNow = heapUsed() - baselineHeapBytes;
    peak = Math.max(peak, heapNow);
    if (measured) {
      sleepingHeap += heapNow;
      sleepingRegionEdges += regionEdges();
    }
    const reactivate = measure(() => {
      resume();
      toggle = makeWatchers(1);
    });

    // Correctness: every computed of both regions against the reference.
    const expected = reference();
    for (let region = 0; region < 2; region++) {
      for (let layer = 0; layer < layers; layer++) {
        for (let i = 0; i < width; i++) {
          const raw = readConsumer(nodes[region]![layer]![i]!);
          const value = layer === top ? (raw as Top).v : (raw as number);
          checked++;
          if (value !== expected[region]![layer]![i]) mismatches++;
        }
      }
    }
    const active = regionEdges();
    activeEdges.min = Math.min(activeEdges.min, active);
    activeEdges.max = Math.max(activeEdges.max, active);

    if (measured) {
      add(sums.deactivate, deactivate);
      add(sums.sleep, sleep);
      add(sums.reactivate, reactivate);
      nodes[1]![top]!.forEach((node, i) => {
        identityTotal++;
        if (node.payload === topBefore[i]) identityKept++;
      });
    }
    await fullGc();
    peak = Math.max(peak, heapUsed() - baselineHeapBytes);
  }

  const mean = (cost: PhaseCost): PhaseCost => {
    const out = { ...cost };
    for (const key of Object.keys(out) as (keyof PhaseCost)[])
      out[key] /= options.cycles;
    return out;
  };
  const deactivate = mean(sums.deactivate);
  const sleep = mean(sums.sleep);
  const reactivate = mean(sums.reactivate);
  const work = (c: PhaseCost) =>
    c.pushEdges + c.pullEdges + c.computes + c.edgesCreated + c.edgesRemoved;

  if (sink === Number.MIN_VALUE) console.log(sink);

  return {
    experiment: "D",
    options,
    deactivate,
    sleep,
    reactivate,
    totalWork: work(deactivate) + work(sleep) + work(reactivate),
    totalNs: deactivate.ns + sleep.ns + reactivate.ns,
    sleepingHeapBytes: sleepingHeap / options.cycles,
    peakHeapBytes: peak,
    sleepingRegionEdges: sleepingRegionEdges / options.cycles,
    resultIdentityKept: identityTotal === 0 ? 0 : identityKept / identityTotal,
    activeRegionEdges: activeEdges,
    checkedValues: checked,
    mismatches,
  };
}
