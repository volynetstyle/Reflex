import {
  blackhole,
  type BenchHarness,
  type BenchVariant,
  HarnessMetrics,
  registerBenchFile,
  type WriteInput,
} from "./shared";

import {
  CONSUMER_INITIAL_STATE,
  ConsumerReadMode,
  DIRTY_STATE,
  disposeWatcher,
  PRODUCER_INITIAL_STATE,
  readConsumer,
  readProducer,
  ReactiveNode,
  ReactiveNodeState,
  runWatcher,
  WATCHER_INITIAL_STATE,
  writeProducer,
  ExecutionContext,
  createExecutionContext,
  setDefaultContext,
} from "@reflex/runtime";

type EffectNode = ReactiveNode<unknown>;

const compareNumbers = (left: number, right: number): boolean =>
  Object.is(left, right);

// ReactiveNodeState.Scheduled = 1 << 8
const SCHEDULED_BIT = ReactiveNodeState.Scheduled;

// ─── Harness ──────────────────────────────────────────────────────────────────
//
// Scheduler state lives on the instance, not at module level.
//
// Why not module-level (aliens-signals style)?
// registerBenchFile creates a sampleRunner AND a benchRunner for each variant
// simultaneously — both are alive at the same time. Shared batchDepth would
// cause one harness's batch() to suppress the other's flush. Shared queue
// would mix up their effect nodes. Per-instance fields avoid all of this with
// negligible overhead: `this.` in a tight loop costs nothing after JIT.

class ReflexHarness implements BenchHarness {
  readonly metrics = new HarnessMetrics();
  private readonly effectNodes: EffectNode[] = [];
  private readonly context: ExecutionContext;

  private queue: (EffectNode | undefined)[] = new Array(128);
  private notifyIndex = 0;
  private queuedLength = 0;
  private batchDepth = 0;

  constructor() {
    const c = createExecutionContext({});
    setDefaultContext(c);
    this.context = c;
  }

  private _enqueue(node: EffectNode): void {
    // Dedup: same watcher can be invalidated multiple times in one batch
    // (two writes both propagating to the same effect via different paths).
    if ((node.state & SCHEDULED_BIT) !== 0) return;
    node.state |= SCHEDULED_BIT;

    if (this.queuedLength === this.queue.length) {
      this.queue = this.queue.concat(new Array(this.queue.length));
    }
    this.metrics.schedulerOps += 1;
    this.metrics.stepAllocations += 1;
    this.queue[this.queuedLength++] = node;
  }

  private _flush(): void {
    const c = this.context;
    this.metrics.schedulerOps += 1;

    const queue = this.queue;
    try {
      while (this.notifyIndex < this.queuedLength) {
        const node = queue[this.notifyIndex]!;
        queue[this.notifyIndex++] = undefined;

        // Clear before run so a re-entrant write inside the effect
        // can re-enqueue this node within the same flush.
        node.state &= ~SCHEDULED_BIT;

        const state = node.state;
        if ((state & ReactiveNodeState.Disposed) !== 0) continue;
        if ((state & DIRTY_STATE) === 0) continue;
        runWatcher(node);
      }
    } finally {
      // Exception path: drain remaining slots and clear their Scheduled bit.
      while (this.notifyIndex < this.queuedLength) {
        const node = queue[this.notifyIndex]!;
        queue[this.notifyIndex++] = undefined;
        node.state &= ~SCHEDULED_BIT;
      }
      this.notifyIndex = 0;
      this.queuedLength = 0;
    }
  }

  signal(
    initial: number,
    _label?: string,
  ): readonly [() => number, (value: WriteInput) => void] {
    this.metrics.setupAllocations += 1;

    const node = new ReactiveNode<number>(
      initial,
      null,
      PRODUCER_INITIAL_STATE,
    );
    const context = this.context;
    const metrics = this.metrics;

    const read = (): number => readProducer(node);

    const write = (value: WriteInput): void => {
      metrics.schedulerOps += 1;
      writeProducer(
        node,
        typeof value === "function" ? value(readProducer(node)) : value,
        compareNumbers,
      );
      if (!this.batchDepth) {
        this._flush();
      }
    };

    return [read, write] as const;
  }

  memo(fn: () => number, _label?: string): () => number {
    this.metrics.setupAllocations += 1;

    const metrics = this.metrics;
    const context = this.context;

    const node = new ReactiveNode<number>(
      0,
      () => {
        metrics.recomputes += 1;
        return fn();
      },
      CONSUMER_INITIAL_STATE,
    );

    return (): number => {
      metrics.refreshes += 1;
      return readConsumer(node, ConsumerReadMode.lazy);
    };
  }

  effect(
    read: () => number,
    _meta?: { label?: string; priority?: number },
  ): () => void {
    this.metrics.setupAllocations += 1;

    const metrics = this.metrics;

    const node = new ReactiveNode<unknown>(
      null,
      () => {
        metrics.recomputes += 1;
        metrics.schedulerOps += 1;
        const start = metrics.stepStartMs;
        if (start >= 0) {
          const latency = performance.now() - start;
          if (latency > metrics.maxFlushLatencyMs) {
            metrics.maxFlushLatencyMs = latency;
          }
        }
        blackhole(read());
      },
      WATCHER_INITIAL_STATE,
    );

    runWatcher(node);
    this.effectNodes.push(node);

    return (): void => {
      disposeWatcher(node);
    };
  }

  batch<T>(fn: () => T): T {
    ++this.batchDepth;
    try {
      return fn();
    } finally {
      if (!--this.batchDepth) {
        this._flush();
      }
    }
  }

  flush(): void {
    this._flush();
  }

  resetRunMetrics(): void {
    this.metrics.resetRunMetrics();
  }

  beginStep(): void {
    this.metrics.beginStep();
  }

  endStep(wallTimeMs: number) {
    return this.metrics.endStep(wallTimeMs);
  }

  dispose(): void {
    const nodes = this.effectNodes;
    for (let i = nodes.length - 1; i >= 0; --i) {
      disposeWatcher(nodes[i]!);
    }
    nodes.length = 0;
  }
}

const variants: readonly BenchVariant[] = [
  {
    label: "reflex-signals",
    createHarness: () => new ReflexHarness(),
  },
];

registerBenchFile("reflex", variants);
