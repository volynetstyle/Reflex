import { performance } from "node:perf_hooks";

import {
  configureRuntimeContext,
  resetRuntimeContext,
  runWatcher,
} from "../../../src/internal";
import { Watcher, type ReactiveNode } from "../../../src/kernel/shape";
import {
  readRuntimeProfileCounters,
  resetRuntimeProfileCounters,
  setRuntimeProfilingEnabled,
  type RuntimeProfileCounters,
} from "../../../src/profiling";

/**
 * Shared measurement tools for the lifetime experiments. Nothing here touches
 * the runtime beyond the public scheduler hook and read-only walks over the
 * existing node/edge fields.
 */

export type Node = ReactiveNode<unknown>;

// ---------------------------------------------------------------- scheduler

const queue: Node[] = [];

/** Fresh ambient context with a FIFO watcher queue. */
export function installQueueScheduler(): void {
  queue.length = 0;
  resetRuntimeContext();
  configureRuntimeContext({
    hooks: { onNodeInvalidated: (node) => void queue.push(node as Node) },
  });
}

export function flush(): number {
  let runs = 0;
  for (let i = 0; i < queue.length; i++) {
    runWatcher(queue[i] as never);
    runs++;
  }
  queue.length = 0;
  return runs;
}

// ---------------------------------------------------------------- heap / gc

export async function fullGc(): Promise<void> {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (typeof gc !== "function") throw new Error("Run with --expose-gc");
  // WeakRef targets stay alive until the end of the current job, so yield
  // between collections.
  for (let i = 0; i < 4; i++) {
    gc();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

export const heapUsed = () => process.memoryUsage().heapUsed;

// ---------------------------------------------------------------- retention

/**
 * WeakRefs to objects that belong to an unmounted owner. `retained()` counts
 * the ones still reachable after a full GC and drops collected entries.
 */
export class RetentionTracker {
  private refs: WeakRef<object>[] = [];
  released = 0;

  release(objects: readonly object[]): void {
    for (const object of objects) this.refs.push(new WeakRef(object));
    this.released += objects.length;
  }

  /** Call after fullGc(). */
  retained(): number {
    this.refs = this.refs.filter((ref) => ref.deref() !== undefined);
    return this.refs.length;
  }
}

// ---------------------------------------------------------------- census

export type NodeKind = "producer" | "consumer" | "watcher";

export const kindOf = (node: Node): NodeKind =>
  (node.state & Watcher) !== 0
    ? "watcher"
    : node.compute === undefined
      ? "producer"
      : "consumer";

export interface GraphCensus {
  nodes: number;
  producers: number;
  consumers: number;
  watchers: number;
  edges: number;
  /** Nodes classified as dead (owner gone / nothing observes them). */
  deadNodes: number;
  /** Edges whose subscriber is dead: links nobody needs. */
  deadEdges: number;
}

/**
 * Walks the connected component(s) of `roots` through both edge directions.
 * Every edge is counted once, from its source's out-list.
 */
export function censusGraph(
  roots: readonly Node[],
  isDead: (node: Node) => boolean,
): GraphCensus {
  const seen = new Set<Node>(roots);
  const stack = [...roots];
  const census: GraphCensus = {
    nodes: 0,
    producers: 0,
    consumers: 0,
    watchers: 0,
    edges: 0,
    deadNodes: 0,
    deadEdges: 0,
  };

  while (stack.length !== 0) {
    const node = stack.pop()!;
    census.nodes++;
    census[`${kindOf(node)}s`]++;
    if (isDead(node)) census.deadNodes++;

    for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
      census.edges++;
      if (isDead(edge.to)) census.deadEdges++;
      if (!seen.has(edge.to)) {
        seen.add(edge.to);
        stack.push(edge.to);
      }
    }
    for (let edge = node.firstIn; edge !== null; edge = edge.nextIn) {
      if (!seen.has(edge.from)) {
        seen.add(edge.from);
        stack.push(edge.from);
      }
    }
  }

  return census;
}

/**
 * Nodes that can reach at least one of `watchers` through out-edges, i.e. the
 * subgraph some live observer still depends on.
 */
export function observedSet(watchers: Iterable<Node>): Set<Node> {
  const observed = new Set<Node>();
  const stack: Node[] = [];
  for (const watcher of watchers) {
    observed.add(watcher);
    stack.push(watcher);
  }
  while (stack.length !== 0) {
    const node = stack.pop()!;
    for (let edge = node.firstIn; edge !== null; edge = edge.nextIn) {
      if (!observed.has(edge.from)) {
        observed.add(edge.from);
        stack.push(edge.from);
      }
    }
  }
  return observed;
}

// ---------------------------------------------------------------- write cost

export interface WriteCost {
  writes: number;
  nsPerWrite: number;
  pushEdgesPerWrite: number;
  pushDirectEdgesPerWrite: number;
  pushTransitiveEdgesPerWrite: number;
  pushDirtySkipsPerWrite: number;
  pullEdgesPerWrite: number;
  computeRunsPerWrite: number;
  watcherRunsPerWrite: number;
  frontierEdgesPerWrite: number;
}

/**
 * Two passes of `writes` iterations of write+flush: an untimed-counter pass
 * for structural work, and a counter-free pass for wall time. Both passes
 * write fresh values, so every write propagates.
 */
export function probeWrites(
  writes: number,
  step: (iteration: number) => void,
): WriteCost {
  resetRuntimeProfileCounters();
  setRuntimeProfilingEnabled(true);
  for (let i = 0; i < writes; i++) {
    step(i);
    flush();
  }
  setRuntimeProfilingEnabled(false);
  const counters: RuntimeProfileCounters = readRuntimeProfileCounters();

  const start = performance.now();
  for (let i = 0; i < writes; i++) {
    step(writes + i);
    flush();
  }
  const elapsed = performance.now() - start;

  const per = (value: number) => value / writes;
  return {
    writes,
    nsPerWrite: (elapsed * 1e6) / writes,
    pushEdgesPerWrite: per(
      counters.pushDirectEdgesVisited + counters.pushTransitiveEdgesVisited,
    ),
    pushDirectEdgesPerWrite: per(counters.pushDirectEdgesVisited),
    pushTransitiveEdgesPerWrite: per(counters.pushTransitiveEdgesVisited),
    pushDirtySkipsPerWrite: per(counters.pushAlreadyDirtySkipped),
    pullEdgesPerWrite: per(counters.pullEdgesVisited),
    computeRunsPerWrite: per(counters.advanceComputeRuns),
    watcherRunsPerWrite: per(counters.watcherExecutions),
    frontierEdgesPerWrite: per(counters.watcherFrontierEdgesVisited),
  };
}

// ---------------------------------------------------------------- misc

/** mulberry32: deterministic graphs across variants. */
export function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}
