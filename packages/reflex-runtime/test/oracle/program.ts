/**
 * Baseline differential oracle: program language, generator, interpreter and
 * shrinker. Programs only use exported runtime operations, so the same program
 * runs unchanged on the frozen baseline bundle and on the implementation under
 * test. Nothing here imports runtime internals.
 *
 * The language deliberately covers regions the semantic contract leaves open
 * (writes and disposal during computation, hook reentry, context switches):
 * there the requirement is exact agreement with the baseline.
 */

// The subset of the runtime module both sides must export.
export interface RuntimeModule {
  createProducer(value: unknown): Node;
  createConsumer(compute: () => unknown): Node;
  createWatcher(compute: () => unknown): Node;
  readProducer(node: Node): unknown;
  writeProducer(node: Node, value: unknown): void;
  readConsumer(node: Node, mode?: number): unknown;
  ConsumerReadMode: { eager: number; lazy: number };
  runWatcher(node: Node): void;
  disposeWatcher(node: Node): void;
  disposeNode(node: Node): void;
  untracked<T>(fn: () => T): T;
  enterReactiveBatch(): void;
  leaveReactiveBatch(): void;
  resetRuntimeContext(context?: unknown): void;
  configureRuntimeContext(context: unknown, options: unknown): void;
  createRuntimeContext(options?: unknown): unknown;
  runWithRuntimeContext<T>(context: unknown, fn: () => T): T;
  getActiveRuntimeContext(): unknown;
  // `setTrackingEpoch` before the 2026-10-24 rename; the frozen baseline
  // bundle still exports that name.
  setTrackingStamp?(stamp: number): void;
  setTrackingEpoch?(stamp: number): void;
  claimWatcherSchedule(node: Node): boolean;
  releaseWatcherSchedule(node: Node): void;
  currentConsumer: Node | null;
}

export interface Node {
  state: number;
  payload: unknown;
  firstIn: Edge | null;
  firstOut: Edge | null;
  tailIn: Edge | null;
}

interface Edge {
  from: Node;
  to: Node;
  nextIn: Edge | null;
  nextOut: Edge | null;
}

export type ReadMode = "lazy" | "eager" | "untracked";

export interface ReadStep {
  node: number;
  mode: ReadMode;
  /** Read only when this producer's value has the given parity. */
  when?: { producer: number; parity: 0 | 1 };
}

export type NestedAction =
  | { kind: "write"; producer: number; delta: number }
  | { kind: "read"; node: number; mode: ReadMode }
  | { kind: "dispose"; watcher: number }
  | { kind: "foreign-read"; node: number };

export interface CallbackSpec {
  reads: ReadStep[];
  /** Read in reverse order when this producer has the given parity. */
  reverseWhen?: { producer: number; parity: 0 | 1 };
  /** Throw when the sum of read values mod 5 equals this. */
  throwWhen?: number;
  /** Perform `action` when the sum mod 3 equals `actionWhen`. */
  action?: NestedAction;
  actionWhen?: number;
}

export interface WatcherSpec extends CallbackSpec {
  cleanup?: { action?: NestedAction; throwWhen?: number };
}

export interface GraphSpec {
  /**
   * Host protocol: `claim` follows reflex-scheduler (claim on invalidation,
   * release before running, skip disposed); `plain` queues every delivery.
   */
  host: "claim" | "plain";
  /** Action run inside every n-th invalidation hook call of context A. */
  hook?: { action: NestedAction; every: number };
  producers: number;
  consumers: CallbackSpec[];
  watchers: WatcherSpec[];
}

export type Op =
  | { kind: "write"; producer: number; value: number }
  | { kind: "read"; node: number; mode: ReadMode }
  | { kind: "flush" }
  | { kind: "run"; watcher: number }
  | { kind: "dispose"; node: number }
  | { kind: "batch"; ops: Op[] }
  | { kind: "context"; ops: Op[] }
  | { kind: "epoch"; value: number }
  | { kind: "snapshot" };

export interface Program {
  spec: GraphSpec;
  ops: Op[];
}

export type ObservationLevel = "strict" | "observable";

/** Whether a program moves the tracking clock directly (an `epoch` operation). */
export function touchesEpoch(ops: readonly Op[]): boolean {
  return ops.some(
    (op) =>
      op.kind === "epoch" ||
      ((op.kind === "batch" || op.kind === "context") && touchesEpoch(op.ops)),
  );
}

/**
 * F1 domain: some consumer's nested action writes a producer that consumer
 * reads, directly or through other consumers. Such a consumer can be
 * invalidated during its own evaluation (F1, open), so liveness is not
 * required of the program.
 */
export function selfInvalidates(spec: GraphSpec): boolean {
  const memo = new Map<number, Set<number>>();
  const reach = (id: number): Set<number> => {
    if (id < spec.producers) return new Set([id]);
    const known = memo.get(id);
    if (known !== undefined) return known;
    const out = new Set<number>();
    memo.set(id, out); // cycle guard
    for (const read of spec.consumers[id - spec.producers]?.reads ?? [])
      for (const producer of reach(read.node)) out.add(producer);
    return out;
  };
  return spec.consumers.some(
    (consumer, index) =>
      consumer.action?.kind === "write" &&
      reach(spec.producers + index).has(consumer.action.producer),
  );
}

// ---------------------------------------------------------------------------
// Generator

export function prng(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

const int = (random: () => number, n: number) => Math.floor(random() * n);
const chance = (random: () => number, p: number) => random() < p;
const pick = <T>(random: () => number, items: readonly T[]): T =>
  items[int(random, items.length)]!;

function genMode(random: () => number): ReadMode {
  const r = random();
  return r < 0.75 ? "lazy" : r < 0.9 ? "eager" : "untracked";
}

function genAction(
  random: () => number,
  spec: GraphSpec,
  readable: number,
): NestedAction {
  const r = random();
  if (r < 0.55) {
    return {
      kind: "write",
      producer: int(random, spec.producers),
      delta: 1 + int(random, 2),
    };
  }
  if (r < 0.8 && readable > 0) {
    return { kind: "read", node: int(random, readable), mode: genMode(random) };
  }
  if (r < 0.9 && spec.watchers.length > 0) {
    return { kind: "dispose", watcher: int(random, spec.watchers.length) };
  }
  return { kind: "foreign-read", node: int(random, Math.max(1, readable)) };
}

function genReads(
  random: () => number,
  spec: GraphSpec,
  readable: number,
): ReadStep[] {
  const reads: ReadStep[] = [];
  const count = chance(random, 0.25) ? 3 + int(random, 5) : 1 + int(random, 3);
  for (let i = 0; i < count; i++) {
    const step: ReadStep = {
      node: int(random, readable),
      mode: genMode(random),
    };
    if (chance(random, 0.3)) {
      step.when = {
        producer: int(random, spec.producers),
        parity: int(random, 2) as 0 | 1,
      };
    }
    reads.push(step);
  }
  return reads;
}

function genCallback(
  random: () => number,
  spec: GraphSpec,
  readable: number,
): CallbackSpec {
  const callback: CallbackSpec = { reads: genReads(random, spec, readable) };
  if (chance(random, 0.25)) {
    callback.reverseWhen = {
      producer: int(random, spec.producers),
      parity: int(random, 2) as 0 | 1,
    };
  }
  if (chance(random, 0.12)) callback.throwWhen = int(random, 5);
  if (chance(random, 0.2)) {
    callback.action = genAction(random, spec, readable);
    callback.actionWhen = int(random, 3);
  }
  return callback;
}

/** Wide family: one consumer over more producers than the prefix scan limit. */
function wideSpec(random: () => number): GraphSpec {
  const producers = 34 + int(random, 12);
  const reads: ReadStep[] = Array.from({ length: producers }, (_, node) => ({
    node,
    mode: "lazy" as const,
    ...(chance(random, 0.1)
      ? { when: { producer: 0, parity: int(random, 2) as 0 | 1 } }
      : {}),
  }));
  // Re-reads after a long prefix exercise duplicate detection past the scan
  // limit (the version fallback).
  for (let i = 0; i < 3; i++) {
    reads.push({ node: int(random, producers), mode: "lazy" });
  }
  return {
    host: "claim",
    producers,
    consumers: [
      { reads, reverseWhen: { producer: 1, parity: 1 } },
      {
        reads: [{ node: producers, mode: "lazy" }, ...reads.slice(0, 3)],
        reverseWhen: { producer: 2, parity: 0 },
      },
    ],
    watchers: [{ reads: [{ node: producers + 1, mode: "lazy" }] }],
  };
}

/**
 * Deep family: a chain deeper than the walkers' retained stack capacity. As a
 * comb, every chain node also feeds a side leaf, so push keeps one pending
 * sibling per level.
 */
function deepSpec(random: () => number): GraphSpec {
  const depth = 520 + int(random, 120);
  const comb = chance(random, 0.5);
  const consumers: CallbackSpec[] = [];
  // Chain consumer i has id 2 + i and reads the previous chain node.
  for (let i = 0; i < depth; i++) {
    consumers.push({
      reads:
        i === 0
          ? [{ node: 0, mode: "lazy" }]
          : i % 97 === 50
            ? [
                { node: 1 + i, mode: "lazy" },
                { node: 1, mode: "lazy" },
              ]
            : [{ node: 1 + i, mode: "lazy" }],
    });
  }
  if (comb) {
    for (let i = 0; i < depth; i++) {
      consumers.push({ reads: [{ node: 2 + i, mode: "lazy" }] });
    }
  }
  const watchers: WatcherSpec[] = [
    { reads: [{ node: 1 + depth, mode: "lazy" }] },
  ];
  if (comb) {
    // Reading every leaf links the comb's side edges.
    watchers.push({
      reads: Array.from({ length: depth }, (_, i) => ({
        node: 2 + depth + i,
        mode: "lazy" as const,
      })),
    });
  }
  return {
    host: chance(random, 0.5) ? "claim" : "plain",
    producers: 2,
    consumers,
    watchers,
  };
}

/**
 * Hub family (generateHubProgram only, so the default distribution and its
 * pinned seeds are unchanged): a producer hub (id 0) and a computed hub (the
 * first consumer) with more subscribers than the lookup's outgoing head
 * start, re-read by wide consumers between their other reads. This drives
 * the outgoing hint (INV-H) through fills, hits, conditional drops and
 * re-reads, disposal and throws.
 */
function hubSpec(random: () => number): GraphSpec {
  const producers = 3 + int(random, 4);
  const hub = producers;
  const spec: GraphSpec = {
    host: chance(random, 0.5) ? "claim" : "plain",
    producers,
    consumers: [],
    watchers: [],
  };
  const watcherCount = 1 + int(random, 3);
  spec.watchers = Array.from({ length: watcherCount }, () => ({ reads: [] }));
  const gate = (): ReadStep["when"] => ({
    producer: 1 + int(random, producers - 1),
    parity: int(random, 2) as 0 | 1,
  });
  // Nested actions read, dispose and switch context but never write: a write
  // from inside an evaluation reaches the baseline's known delivery defects
  // (F1, F15, F17), whose acceptance rules this family would hit far more
  // often than the default one without testing the hint any better.
  const action = (readable: number): NestedAction => {
    const r = random();
    if (r < 0.5)
      return {
        kind: "read",
        node: int(random, readable),
        mode: genMode(random),
      };
    if (r < 0.8)
      return { kind: "dispose", watcher: int(random, spec.watchers.length) };
    return { kind: "foreign-read", node: int(random, readable) };
  };
  const extras = (callback: CallbackSpec, readable: number) => {
    if (chance(random, 0.25))
      callback.reverseWhen = { producer: 1, parity: int(random, 2) as 0 | 1 };
    if (chance(random, 0.12)) callback.throwWhen = int(random, 5);
    if (chance(random, 0.25)) {
      callback.action = action(readable);
      callback.actionWhen = int(random, 3);
    }
    return callback;
  };

  // The computed hub.
  spec.consumers.push({
    reads: [
      { node: 0, mode: "lazy" },
      { node: 1, mode: "lazy", when: gate() },
    ],
  });
  // Plain subscribers of both hubs.
  const fan = 5 + int(random, 5);
  for (let i = 0; i < fan; i++) {
    const readable = producers + spec.consumers.length;
    const reads: ReadStep[] = [
      {
        node: 0,
        mode: "lazy",
        ...(chance(random, 0.2) ? { when: gate() } : {}),
      },
      { node: hub, mode: "lazy" },
    ];
    if (chance(random, 0.5)) reads.reverse();
    spec.consumers.push(extras({ reads }, readable));
  }
  // Wide consumers: every other read re-reads a hub.
  const subscribers = spec.consumers.length;
  for (let w = 0; w < 2; w++) {
    const readable = producers + spec.consumers.length;
    const reads: ReadStep[] = [];
    const count = 4 + int(random, 6);
    for (let k = 0; k < count; k++) {
      const other = chance(random, 0.7)
        ? 1 + int(random, producers - 1)
        : producers + 1 + int(random, subscribers - 1);
      reads.push({
        node: other,
        mode: chance(random, 0.85) ? "lazy" : genMode(random),
        ...(chance(random, 0.3) ? { when: gate() } : {}),
      });
      reads.push({ node: chance(random, 0.7) ? 0 : hub, mode: "lazy" });
    }
    spec.consumers.push(extras({ reads }, readable));
  }
  const readable = producers + spec.consumers.length;
  spec.watchers = spec.watchers.map(() => {
    const reads: ReadStep[] = [];
    const count = 2 + int(random, 4);
    for (let k = 0; k < count; k++) {
      reads.push({ node: readable - 1 - int(random, 2), mode: "lazy" });
      reads.push({
        node: chance(random, 0.6) ? 0 : hub,
        mode: "lazy",
        ...(chance(random, 0.3) ? { when: gate() } : {}),
      });
    }
    const watcher: WatcherSpec = extras({ reads }, readable);
    if (chance(random, 0.3)) {
      watcher.cleanup = {};
      if (chance(random, 0.6)) watcher.cleanup.action = action(readable);
    }
    return watcher;
  });
  return spec;
}

export function generateSpec(random: () => number): GraphSpec {
  const family = random();
  if (family < 0.04) return wideSpec(random);
  if (family < 0.06) return deepSpec(random);
  const spec: GraphSpec = {
    host: chance(random, 0.5) ? "claim" : "plain",
    producers: 1 + int(random, 4),
    consumers: [],
    watchers: [],
  };
  const consumerCount = int(random, 6);
  const watcherCount = int(random, 4);
  // Placeholder so actions can target watchers by index.
  spec.watchers = Array.from({ length: watcherCount }, () => ({ reads: [] }));
  for (let i = 0; i < consumerCount; i++) {
    // Consumers read only lower ids: the graph is acyclic by construction.
    spec.consumers.push(genCallback(random, spec, spec.producers + i));
  }
  const readable = spec.producers + spec.consumers.length;
  spec.watchers = spec.watchers.map(() => {
    const watcher: WatcherSpec = genCallback(random, spec, readable);
    if (chance(random, 0.3)) {
      watcher.cleanup = {};
      if (chance(random, 0.5))
        watcher.cleanup.action = genAction(random, spec, readable);
      if (chance(random, 0.2)) watcher.cleanup.throwWhen = int(random, 5);
    }
    return watcher;
  });
  if (chance(random, 0.12)) {
    spec.hook = {
      action: genAction(random, spec, readable),
      every: 1 + int(random, 3),
    };
  }
  return spec;
}

function genOp(random: () => number, spec: GraphSpec, depth: number): Op {
  const readable = spec.producers + spec.consumers.length;
  const total = readable + spec.watchers.length;
  const r = random();
  if (r < 0.34)
    return {
      kind: "write",
      producer: int(random, spec.producers),
      value: int(random, 4),
    };
  if (r < 0.56)
    return { kind: "read", node: int(random, readable), mode: genMode(random) };
  if (r < 0.7) return { kind: "flush" };
  if (r < 0.76 && spec.watchers.length > 0)
    return { kind: "run", watcher: int(random, spec.watchers.length) };
  if (r < 0.8) return { kind: "dispose", node: int(random, total) };
  if (r < 0.87 && depth < 2)
    return {
      kind: "batch",
      ops: Array.from({ length: 1 + int(random, 4) }, () =>
        genOp(random, spec, depth + 1),
      ),
    };
  if (r < 0.92 && depth < 2)
    return {
      kind: "context",
      ops: Array.from({ length: 1 + int(random, 3) }, () =>
        genOp(random, spec, depth + 1),
      ),
    };
  if (r < 0.94)
    return {
      kind: "epoch",
      value: pick(random, [0, 1, 0x7fffffff, 0xfffffffe, 0xffffffff]),
    };
  return { kind: "snapshot" };
}

export function generateProgram(seed: number, maxOps = 40): Program {
  const random = prng(seed);
  const spec = generateSpec(random);
  const ops: Op[] = [];
  const length = 5 + int(random, maxOps);
  for (let i = 0; i < length; i++) ops.push(genOp(random, spec, 0));
  ops.push({ kind: "flush" }, { kind: "snapshot" });
  return { spec, ops };
}

/** A hub-family program (see hubSpec); seeds are independent of generateProgram. */
export function generateHubProgram(seed: number, maxOps = 40): Program {
  const random = prng(seed + 0x6a09e667);
  const spec = hubSpec(random);
  const ops: Op[] = [];
  const length = 5 + int(random, maxOps);
  for (let i = 0; i < length; i++) ops.push(genOp(random, spec, 0));
  ops.push({ kind: "flush" }, { kind: "snapshot" });
  return { spec, ops };
}

// ---------------------------------------------------------------------------
// Interpreter

const FLUSH_CAP = 64;
const CALLBACK_BUDGET = 4_000;

class BudgetExceeded extends Error {
  constructor() {
    super("callback budget exceeded");
    this.name = "BudgetExceeded";
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}:${error.message}`;
  return `thrown:${String(error)}`;
}

// Bit values are fixed by the baseline (src/kernel/shape/meta.ts).
const STRICT_MASK = 0b1111_1111; // Unknown..WatcherCleanupPending
const OBSERVABLE_MASK = 0b0010_0011; // Unknown | Changed | Scheduled

/**
 * Algorithm-independent invariants, checked after every top-level operation
 * when `interpret` runs with `{ invariants: true }`. They do not depend on how
 * tracking reconciles edges, so an implementation and a baseline that share a
 * defect still cannot agree on a violation:
 *
 * - integrity: every incoming edge is in its source's outgoing list and the
 *   reverse, and no source appears twice in a node's incoming list;
 * - exact dependencies: a node whose last execution returned has exactly the
 *   incoming sources it read with tracking during that execution, in order of
 *   first read. Disposing a node unlinks its edges, during or after that
 *   execution; a later read of a disposed producer links it again. A node
 *   disposed after its execution started has no incoming sources, except
 *   one disposed during its own execution: reads after the disposal link
 *   again and nothing unlinks them (F14, open), so it is not checked until a
 *   later execution starts, whether the execution that saw the disposal
 *   returned or threw. A read is tracked when it runs with the
 *   node as `currentConsumer`, outside `untracked`, and is not an eager
 *   consumer read. A failed execution leaves the set unspecified.
 * - liveness, for a live watcher whose last attempt executed and did not
 *   throw: after every operation, a dirty one is in a host queue (delivery,
 *   F15); at quiescence (a flush op drained both queues), a clean one has no
 *   dirty source (reachability: push stops at a dirty node, F16). A flush
 *   cap drops host deliveries and ends liveness checking. Watchers
 *   that never ran or last failed are left to host retry policy, which this
 *   host does not implement.
 *
 * - tail (INV-H): a Computing node's tailIn is null or an incoming edge, also
 *   at the end of each of its callbacks; an idle node's is null, an incoming
 *   edge, or an attached outgoing hint that is not a self-edge.
 *
 * A violation is appended to the trace as `invariant:<detail>`; liveness
 * violations as `invariant:liveness:<detail>`.
 *
 * Every trace also records, at the end of each callback, the accepted prefix
 * of the running node (`tail:<id>:[sources]`): the semantic tail, compared
 * with the baseline. An idle node's tailIn is not compared, since a hint may
 * replace its residual incoming edge.
 */
export interface InterpretOptions {
  invariants?: boolean;
  /**
   * Receives the trace index of every host delivery made while the watcher
   * was inside its own run (`Computing`, F17). Never affects the trace.
   */
  ownEpochDeliveries?: number[];
}

const COMPUTING = 0b1000; // fixed by the baseline

export function interpret(
  rt: RuntimeModule,
  program: Program,
  level: ObservationLevel = "strict",
  options: InterpretOptions = {},
): string[] {
  const { spec } = program;
  const trace: string[] = [];
  const nodes: Node[] = [];
  const ids = new Map<Node, number>();
  const disposed = new Set<number>();
  let budget = CALLBACK_BUDGET;
  let hookCalls = 0;
  const queues = { A: [] as Node[], B: [] as Node[] };
  const checking = options.invariants === true;
  // Invariant bookkeeping only; never affects the trace otherwise.
  // Expected incoming sources of each running execution, in first-read order.
  const tracked = new Map<Node, number[]>();
  // Event clock ordering executions against disposals.
  let clock = 0;
  const committed = new Map<
    number,
    { reads: number[]; start: number; end: number }
  >();
  const goneAt = new Map<number, number>();
  // Nodes whose latest disposal happened during their own execution (F14).
  const disposedWhileRunning = new Set<number>();
  const dispose = (id: number) => {
    goneAt.set(id, ++clock);
    if (tracked.has(nodes[id]!)) disposedWhileRunning.add(id);
    else disposedWhileRunning.delete(id);
    for (const reads of tracked.values()) {
      const at = reads.indexOf(id);
      if (at !== -1) reads.splice(at, 1);
    }
  };

  rt.resetRuntimeContext();
  const contextA = rt.getActiveRuntimeContext();
  const contextB = rt.createRuntimeContext();
  for (const [name, context] of [
    ["A", contextA],
    ["B", contextB],
  ] as const) {
    rt.configureRuntimeContext(context, {
      hooks: {
        onNodeInvalidated(node: Node) {
          if ((node.state & COMPUTING) !== 0)
            options.ownEpochDeliveries?.push(trace.length);
          if (name === "A" && spec.hook !== undefined) {
            hookCalls += 1;
            if (hookCalls % spec.hook.every === 0) {
              trace.push(`hook-action:${hookCalls}`);
              performAction(spec.hook.action);
            }
          }
          if (spec.host === "claim" && !rt.claimWatcherSchedule(node)) {
            trace.push(`inv-owned:${name}:${ids.get(node)}`);
            return;
          }
          trace.push(`inv:${name}:${ids.get(node)}`);
          queues[name].push(node);
        },
        onRuntimeIdle() {
          trace.push(`idle:${name}`);
        },
      },
    });
  }

  const spend = () => {
    if (--budget < 0) throw new BudgetExceeded();
  };

  const valueOf = (value: unknown): number =>
    typeof value === "number" ? value : 0;

  const readNode = (id: number, mode: ReadMode): number => {
    const node = nodes[id]!;
    const read = () =>
      id < spec.producers
        ? rt.readProducer(node)
        : rt.readConsumer(
            node,
            mode === "eager" ? rt.ConsumerReadMode.eager : undefined,
          );
    const reader = checking ? rt.currentConsumer : null;
    const value = valueOf(mode === "untracked" ? rt.untracked(read) : read());
    if (
      reader !== null &&
      mode !== "untracked" &&
      (id < spec.producers || mode !== "eager")
    ) {
      const reads = tracked.get(reader);
      if (reads !== undefined && !reads.includes(id)) reads.push(id);
    }
    return value;
  };

  // Liveness bookkeeping: nodes with a completed execution, and watchers whose
  // last runWatcher attempt threw.
  const executed = new Set<number>();
  const failed = new Set<number>();
  const runWatcher = (node: Node): void => {
    const id = ids.get(node)!;
    try {
      rt.runWatcher(node);
    } catch (error) {
      failed.add(id);
      throw error;
    }
    failed.delete(id);
  };

  /** Runs a node's computation, recording its tracked reads on success. */
  const execution = <T>(id: number, compute: () => T): T => {
    if (!checking) return compute();
    const node = nodes[id]!;
    const reads: number[] = [];
    const start = ++clock;
    tracked.set(node, reads);
    try {
      const result = compute();
      committed.set(id, { reads, start, end: ++clock });
      executed.add(id);
      return result;
    } catch (error) {
      committed.delete(id);
      throw error;
    } finally {
      tracked.delete(node);
    }
  };

  const performAction = (action: NestedAction): void => {
    switch (action.kind) {
      case "write": {
        const node = nodes[action.producer]!;
        rt.writeProducer(node, valueOf(node.payload) + action.delta);
        return;
      }
      case "read":
        readNode(action.node, action.mode);
        return;
      case "dispose": {
        const id = spec.producers + spec.consumers.length + action.watcher;
        dispose(id);
        rt.disposeWatcher(nodes[id]!);
        return;
      }
      case "foreign-read":
        rt.runWithRuntimeContext(contextB, () => readNode(action.node, "lazy"));
    }
  };

  /**
   * The semantic tail of a running computation: the sources of its accepted
   * prefix, `firstIn` through `tailIn`. While a node is Computing its tailIn
   * is the tracking frontier and must agree with the baseline; while it is
   * not, the slot may hold a hint (INV-H) and is not compared.
   */
  const recordFrontier = (id: number): void => {
    const node = nodes[id]!;
    const tail = node.tailIn;
    const prefix: Array<number | undefined> = [];
    let found = tail === null;
    for (let e = node.firstIn; e !== null && !found; e = e.nextIn) {
      prefix.push(ids.get(e.from));
      if (e === tail) found = true;
    }
    if (!found) {
      if (checking)
        trace.push(`invariant:${id}:frontier is not an incoming edge`);
      trace.push(`tail:${id}:detached`);
      return;
    }
    trace.push(`tail:${id}:[${prefix}]`);
  };

  const runCallback = (tag: string, id: number, callback: CallbackSpec) => {
    spend();
    trace.push(`${tag}:${id}`);
    let sum = 0;
    let reads = callback.reads;
    const reverse = callback.reverseWhen;
    if (
      reverse !== undefined &&
      (valueOf(nodes[reverse.producer]!.payload) & 1) === reverse.parity
    ) {
      reads = [...reads].reverse();
    }
    for (const step of reads) {
      if (step.when !== undefined) {
        const gate = valueOf(nodes[step.when.producer]!.payload);
        if ((gate & 1) !== step.when.parity) continue;
      }
      sum += readNode(step.node, step.mode);
    }
    if (callback.action !== undefined && sum % 3 === callback.actionWhen) {
      performAction(callback.action);
    }
    recordFrontier(id);
    if (callback.throwWhen !== undefined && sum % 5 === callback.throwWhen) {
      throw new Error(`${tag}${id}`);
    }
    return sum;
  };

  for (let i = 0; i < spec.producers; i++) {
    const node = rt.createProducer(i);
    ids.set(node, nodes.length);
    nodes.push(node);
  }
  spec.consumers.forEach((consumer, index) => {
    const id = spec.producers + index;
    const node = rt.createConsumer(() =>
      execution(id, () => runCallback("c", id, consumer)),
    );
    ids.set(node, id);
    nodes.push(node);
  });
  spec.watchers.forEach((watcher, index) => {
    const id = spec.producers + spec.consumers.length + index;
    const node = rt.createWatcher(() => {
      const sum = execution(id, () => runCallback("w", id, watcher));
      const cleanup = watcher.cleanup;
      if (cleanup === undefined) return;
      return () => {
        spend();
        trace.push(`cl:${id}`);
        if (cleanup.action !== undefined) performAction(cleanup.action);
        if (cleanup.throwWhen !== undefined && sum % 5 === cleanup.throwWhen) {
          throw new Error(`cl${id}`);
        }
      };
    });
    ids.set(node, id);
    nodes.push(node);
  });

  const isWatcher = (id: number) =>
    id >= spec.producers + spec.consumers.length;

  const flush = (name: "A" | "B") => {
    const queue = queues[name];
    let runs = 0;
    while (queue.length !== 0) {
      if (++runs > FLUSH_CAP) {
        trace.push(`flush-cap:${name}`);
        queue.length = 0;
        return false;
      }
      const node = queue.shift()!;
      if (spec.host === "claim") {
        rt.releaseWatcherSchedule(node);
        if (disposed.has(ids.get(node)!)) continue;
      }
      runWatcher(node);
    }
    return true;
  };

  const DIRTY = 0b11; // Unknown | Changed, fixed by the baseline.
  // A flush cap drops queued deliveries on the host side; liveness is no longer
  // the runtime's obligation for the rest of the program.
  let capped = false;
  const checkLiveness = (quiescent: boolean): void => {
    if (capped) return;
    nodes.forEach((node, id) => {
      if (!isWatcher(id) || disposed.has(id)) return;
      if (!executed.has(id) || failed.has(id)) return;
      if ((node.state & DIRTY) !== 0) {
        if (!queues.A.includes(node) && !queues.B.includes(node))
          trace.push(`invariant:liveness:${id}:dirty watcher without delivery`);
        return;
      }
      if (!quiescent) return;
      for (let e = node.firstIn; e !== null; e = e.nextIn)
        if ((e.from.state & DIRTY) !== 0)
          trace.push(
            `invariant:liveness:${id}:clean watcher behind dirty source ${ids.get(e.from)}`,
          );
    });
  };

  const snapshot = () => {
    const mask = level === "strict" ? STRICT_MASK : OBSERVABLE_MASK;
    const parts: string[] = [];
    nodes.forEach((node, id) => {
      const sources: Array<number | undefined> = [];
      for (let e = node.firstIn; e !== null; e = e.nextIn)
        sources.push(ids.get(e.from));
      const targets: Array<number | undefined> = [];
      for (let e = node.firstOut; e !== null; e = e.nextOut)
        targets.push(ids.get(e.to));
      const payload = isWatcher(id)
        ? typeof node.payload
        : JSON.stringify(node.payload);
      parts.push(
        `${id}{s${node.state & mask} v${payload} in[${sources}] out[${targets}]}`,
      );
    });
    trace.push(`snap:${parts.join(" ")}`);
  };

  const targets = (op: Op): number | undefined => {
    switch (op.kind) {
      case "write":
        return op.producer;
      case "read":
      case "dispose":
        return op.node;
      case "run":
        return spec.producers + spec.consumers.length + op.watcher;
      default:
        return undefined;
    }
  };

  const exec = (op: Op, context: "A" | "B"): void => {
    // Direct operations on disposed nodes are outside the contract.
    const target = targets(op);
    if (target !== undefined && disposed.has(target)) {
      trace.push(`skip:${op.kind}:${target}`);
      return;
    }
    switch (op.kind) {
      case "write":
        rt.writeProducer(nodes[op.producer]!, op.value);
        return;
      case "read":
        trace.push(`read:${op.node}=${readNode(op.node, op.mode)}`);
        return;
      case "flush":
        if (!flush(context)) capped = true;
        else if (checking && queues.A.length + queues.B.length === 0)
          checkLiveness(true);
        return;
      case "run":
        runWatcher(nodes[spec.producers + spec.consumers.length + op.watcher]!);
        return;
      case "dispose":
        disposed.add(op.node);
        dispose(op.node);
        if (isWatcher(op.node)) rt.disposeWatcher(nodes[op.node]!);
        else rt.disposeNode(nodes[op.node]!);
        return;
      case "batch":
        rt.enterReactiveBatch();
        try {
          for (const inner of op.ops) step(inner, context);
        } finally {
          rt.leaveReactiveBatch();
        }
        return;
      case "context": {
        const target = context === "A" ? contextB : contextA;
        rt.runWithRuntimeContext(target, () => {
          for (const inner of op.ops) step(inner, context === "A" ? "B" : "A");
        });
        return;
      }
      case "epoch":
        (rt.setTrackingStamp ?? rt.setTrackingEpoch)!(op.value);
        return;
      case "snapshot":
        snapshot();
    }
  };

  const step = (op: Op, context: "A" | "B") => {
    try {
      exec(op, context);
    } catch (error) {
      trace.push(`err:${describeError(error)}`);
    }
  };

  /**
   * INV-H, normalized: a Computing node's tailIn is null or an incoming edge;
   * an idle node's is null, an incoming edge, or a hint: an outgoing edge of
   * the node that is not a self-edge and is attached to both lists.
   */
  const checkTail = (node: Node, id: number): void => {
    const tail = node.tailIn;
    if (tail === null) return;
    for (let e = node.firstIn; e !== null; e = e.nextIn) if (e === tail) return;
    if ((node.state & COMPUTING) !== 0) {
      trace.push(`invariant:${id}:Computing tailIn is not an incoming edge`);
      return;
    }
    if (tail.from !== node || tail.to === node) {
      trace.push(`invariant:${id}:idle tailIn is neither incoming nor a hint`);
      return;
    }
    let outgoing = false;
    for (let e = node.firstOut; e !== null; e = e.nextOut)
      if (e === tail) outgoing = true;
    let incoming = false;
    for (let e = tail.to.firstIn; e !== null; e = e.nextIn)
      if (e === tail) incoming = true;
    if (!outgoing || !incoming) trace.push(`invariant:${id}:dangling hint`);
  };

  const checkInvariants = (): void => {
    nodes.forEach((node, id) => {
      const sources: number[] = [];
      for (let e = node.firstIn; e !== null; e = e.nextIn) {
        let found = false;
        for (let o = e.from.firstOut; o !== null; o = o.nextOut)
          if (o === e) found = true;
        if (e.to !== node || !found)
          trace.push(`invariant:${id}:incoming edge missing from source list`);
        sources.push(ids.get(e.from)!);
      }
      for (let e = node.firstOut; e !== null; e = e.nextOut) {
        let found = false;
        for (let i = e.to.firstIn; i !== null; i = i.nextIn)
          if (i === e) found = true;
        if (e.from !== node || !found)
          trace.push(`invariant:${id}:outgoing edge missing from target list`);
      }
      if (new Set(sources).size !== sources.length)
        trace.push(`invariant:${id}:duplicate source in [${sources}]`);
      checkTail(node, id);
      const last = committed.get(id);
      const removedAt = goneAt.get(id);
      // F14: disposed during its own execution, whether that execution then
      // returned or threw; checked again once a later execution starts.
      if (
        removedAt !== undefined &&
        disposedWhileRunning.has(id) &&
        (last === undefined || last.start < removedAt)
      )
        return;
      let expected: number[];
      if (
        removedAt !== undefined &&
        (last === undefined || removedAt > last.start)
      )
        expected = [];
      else if (last === undefined) return;
      else
        expected = last.reads.filter(
          (source) => !((goneAt.get(source) ?? 0) > last.end),
        );
      if (expected.join() !== sources.join())
        trace.push(
          `invariant:${id}:sources [${sources}] but last execution read [${expected}]`,
        );
    });
  };

  for (const op of program.ops) {
    step(op, "A");
    if (checking) {
      checkInvariants();
      checkLiveness(false);
    }
  }
  trace.push(
    `end:consumer=${rt.currentConsumer === null ? "null" : "leaked"}:active=${
      rt.getActiveRuntimeContext() === contextA ? "A" : "other"
    }`,
  );
  snapshot();
  return trace;
}

// ---------------------------------------------------------------------------
// Comparison and shrinking

export interface Mismatch {
  index: number;
  baseline: string | undefined;
  candidate: string | undefined;
}

export function firstMismatch(a: string[], b: string[]): Mismatch | null {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) return { index: i, baseline: a[i], candidate: b[i] };
  }
  return null;
}

function opCount(ops: Op[]): number {
  let count = 0;
  for (const op of ops) {
    count += 1;
    if (op.kind === "batch" || op.kind === "context") count += opCount(op.ops);
  }
  return count;
}

export function programSize(program: Program): number {
  const callbacks = [...program.spec.consumers, ...program.spec.watchers];
  return (
    opCount(program.ops) * 4 +
    callbacks.reduce(
      (sum, c) =>
        sum +
        c.reads.length +
        (c.action ? 2 : 0) +
        (c.throwWhen !== undefined ? 1 : 0),
      0,
    )
  );
}

function* opListVariants(ops: Op[]): Generator<Op[]> {
  // Remove chunks of decreasing size, then flatten or shrink nested lists.
  for (let size = Math.max(1, ops.length >> 1); size >= 1; size >>= 1) {
    for (let start = 0; start + size <= ops.length; start += size) {
      yield [...ops.slice(0, start), ...ops.slice(start + size)];
    }
  }
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    if (op.kind === "batch" || op.kind === "context") {
      yield [...ops.slice(0, i), ...op.ops, ...ops.slice(i + 1)];
      for (const inner of opListVariants(op.ops)) {
        yield [...ops.slice(0, i), { ...op, ops: inner }, ...ops.slice(i + 1)];
      }
    }
  }
}

function* specVariants(spec: GraphSpec): Generator<GraphSpec> {
  const clone = (): GraphSpec => JSON.parse(JSON.stringify(spec));
  if (spec.hook !== undefined) {
    const next = clone();
    delete next.hook;
    yield next;
  }
  for (const list of ["consumers", "watchers"] as const) {
    for (let index = 0; index < spec[list].length; index++) {
      const callback: WatcherSpec = spec[list][index]!;
      if (callback.action !== undefined) {
        const next = clone();
        delete next[list][index]!.action;
        delete next[list][index]!.actionWhen;
        yield next;
      }
      if (callback.throwWhen !== undefined) {
        const next = clone();
        delete next[list][index]!.throwWhen;
        yield next;
      }
      if (callback.reverseWhen !== undefined) {
        const next = clone();
        delete next[list][index]!.reverseWhen;
        yield next;
      }
      if (callback.cleanup !== undefined) {
        const next = clone();
        delete (next[list][index] as WatcherSpec).cleanup;
        yield next;
      }
      for (let r = 0; r < callback.reads.length; r++) {
        const next = clone();
        next[list][index]!.reads.splice(r, 1);
        yield next;
        if (callback.reads[r]!.when !== undefined) {
          const unconditional = clone();
          delete unconditional[list][index]!.reads[r]!.when;
          yield unconditional;
        }
      }
    }
  }
}

/**
 * Greedy delta-debugging: keep any smaller program that still fails, until no
 * single-step reduction does.
 */
export function shrink(
  program: Program,
  fails: (program: Program) => boolean,
  maxSteps = 2_000,
): Program {
  let current = program;
  let steps = 0;
  let progress = true;
  while (progress && steps < maxSteps) {
    progress = false;
    for (const ops of opListVariants(current.ops)) {
      if (++steps > maxSteps) break;
      const candidate = { spec: current.spec, ops };
      if (fails(candidate)) {
        current = candidate;
        progress = true;
        break;
      }
    }
    if (progress) continue;
    for (const spec of specVariants(current.spec)) {
      if (++steps > maxSteps) break;
      const candidate = { spec, ops: current.ops };
      if (fails(candidate)) {
        current = candidate;
        progress = true;
        break;
      }
    }
  }
  return current;
}
