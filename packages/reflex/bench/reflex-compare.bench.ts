import {
  CONSUMER_INITIAL_STATE,
  ConsumerReadMode,
  createExecutionContext,
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
  setDefaultContext,
} from "@reflex/runtime/debug";
import {
  blackhole,
  type BenchHarness,
  type BenchVariant,
  type EffectMeta,
  HarnessMetrics,
  registerBenchFile,
  type WriteInput,
} from "./shared";

type ReflexMode =
  | "eager-walk"
  | "heap-ordering"
  | "late-snapshot"
  | "naive-host-queue";

type EffectNode = ReactiveNode<unknown>;

interface HeapEntry {
  node: EffectNode;
  order: number;
  priority: number;
}

const compareNumbers = (left: number, right: number) => Object.is(left, right);
const SCHEDULED_BIT = Scheduled;

// ─── EffectHeap ───────────────────────────────────────────────────────────────

class EffectHeap {
  private readonly items: HeapEntry[] = [];

  get size(): number {
    return this.items.length;
  }

  push(entry: HeapEntry): void {
    this.items.push(entry);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): HeapEntry | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length !== 0) {
      items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    const items = this.items;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(items[index]!, items[parent]!) <= 0) return;
      const tmp = items[parent]!;
      items[parent] = items[index]!;
      items[index] = tmp;
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    const items = this.items;
    const length = items.length;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let best = index;
      if (left < length && this.compare(items[left]!, items[best]!) > 0) best = left;
      if (right < length && this.compare(items[right]!, items[best]!) > 0) best = right;
      if (best === index) return;
      const tmp = items[best]!;
      items[best] = items[index]!;
      items[index] = tmp;
      index = best;
    }
  }

  private compare(left: HeapEntry, right: HeapEntry): number {
    if (left.priority !== right.priority) return left.priority - right.priority;
    return right.order - left.order;
  }
}

// ─── ReflexScheduler ──────────────────────────────────────────────────────────

class ReflexScheduler {
  private readonly fifo: (EffectNode | undefined)[] = new Array(128);
  private readonly heap = new EffectHeap();
  private head = 0;
  private tail = 0;
  private batchDepth = 0;
  private flushing = false;
  private order = 0;

  constructor(
    private readonly mode: ReflexMode,
    private readonly metrics: HarnessMetrics,
    private readonly priorities: WeakMap<EffectNode, number>,
  ) {}

  batch<T>(fn: () => T): T {
    ++this.batchDepth;
    try {
      return fn();
    } finally {
      if (!--this.batchDepth) this.flush();
    }
  }

  enqueue(node: EffectNode): void {
    const metrics = this.metrics;
    metrics.schedulerOps += 1;

    const dedupe = this.mode !== "naive-host-queue";
    if (dedupe) {
      if ((node.state & SCHEDULED_BIT) !== 0) return;
      node.state |= SCHEDULED_BIT;
    }

    metrics.stepAllocations += 1;

    if (this.mode === "heap-ordering") {
      this.heap.push({
        node,
        order: this.order++,
        priority: this.priorities.get(node) ?? 0,
      });
    } else {
      if (this.tail === this.fifo.length) {
        // Amortised growth — rare path
        (this.fifo as EffectNode[]).push(node);
        this.tail = this.fifo.length;
      } else {
        this.fifo[this.tail++] = node;
      }
    }

    // eager-walk: auto-flush handled via onReactiveSettled after propagation
    // completes — not here, to avoid flushing mid-propagation.
  }

  flush(): void {
    if (this.flushing || !this.hasPending()) return;

    this.flushing = true;
    this.metrics.schedulerOps += 1;

    const fifo = this.fifo;
    const dedupe = this.mode !== "naive-host-queue";

    try {
      while (true) {
        const node = this.takeNext();
        if (node === null) break;

        this.metrics.schedulerOps += 1;

        if (dedupe) node.state &= ~SCHEDULED_BIT;

        const state = node.state;
        if ((state & Disposed) !== 0) continue;
        if ((state & DIRTY_STATE) === 0) continue;

        runWatcher(node);
      }
    } finally {
      // Clear remaining SCHEDULED bits on exception path
      if (dedupe) {
        while (this.hasPending()) {
          const node = this.takeNext();
          if (node !== null) node.state &= ~SCHEDULED_BIT;
        }
      }
      // Reset fifo without reallocating
      for (let i = this.head; i < this.tail; i++) fifo[i] = undefined;
      this.head = 0;
      this.tail = 0;
      this.flushing = false;
    }
  }

  notifySettled(): void {
    if (this.mode !== "eager-walk") return;
    if (this.batchDepth !== 0) return;
    this.flush();
  }

  private hasPending(): boolean {
    return this.mode === "heap-ordering"
      ? this.heap.size > 0
      : this.head < this.tail;
  }

  private takeNext(): EffectNode | null {
    if (this.mode === "heap-ordering") {
      return this.heap.pop()?.node ?? null;
    }
    if (this.head >= this.tail) return null;
    const node = this.fifo[this.head]!;
    this.fifo[this.head++] = undefined;
    return node;
  }
}

// ─── ReflexHarness ────────────────────────────────────────────────────────────

class ReflexHarness implements BenchHarness {
  readonly metrics = new HarnessMetrics();
  private readonly priorities = new WeakMap<EffectNode, number>();
  private readonly effectNodes: EffectNode[] = [];
  private readonly scheduler: ReflexScheduler;

  constructor(mode: ReflexMode) {
    const metrics = this.metrics;
    const scheduler = new ReflexScheduler(mode, metrics, this.priorities);
    this.scheduler = scheduler;

    setDefaultContext(createExecutionContext({
      onSinkInvalidated: (node) => {
        scheduler.enqueue(node as EffectNode);
      },
      onReactiveSettled: () => {
        scheduler.notifySettled();
      },
    }));
  }

  signal(
    initial: number,
    _label?: string,
  ): readonly [() => number, (value: WriteInput) => void] {
    this.metrics.setupAllocations += 1;
    const node = new ReactiveNode<number>(initial, null, PRODUCER_INITIAL_STATE);
    const metrics = this.metrics;
    const scheduler = this.scheduler;
    return [
      (): number => readProducer(node),
      (value: WriteInput): void => {
        metrics.schedulerOps += 1;
        writeProducer(
          node,
          typeof value === "function" ? value(readProducer(node)) : value,
          compareNumbers,
        );
        // eager-walk flushes via onReactiveSettled; others flush here
        if (scheduler["batchDepth"] === 0) scheduler.flush();
      },
    ] as const;
  }

  memo(fn: () => number, _label?: string): () => number {
    this.metrics.setupAllocations += 1;
    const metrics = this.metrics;
    const node = new ReactiveNode<number>(
      0,
      () => { metrics.recomputes += 1; return fn(); },
      CONSUMER_INITIAL_STATE,
    );
    return (): number => {
      metrics.refreshes += 1;
      return readConsumer(node, ConsumerReadMode.lazy);
    };
  }

  effect(read: () => number, meta?: EffectMeta): () => void {
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
          if (latency > metrics.maxFlushLatencyMs) metrics.maxFlushLatencyMs = latency;
        }
        blackhole(read());
      },
      WATCHER_INITIAL_STATE,
    );
    this.priorities.set(node, meta?.priority ?? 0);
    runWatcher(node);
    this.effectNodes.push(node);
    return (): void => { disposeWatcher(node); };
  }

  batch<T>(fn: () => T): T { return this.scheduler.batch(fn); }
  flush(): void { this.scheduler.flush(); }
  resetRunMetrics(): void { this.metrics.resetRunMetrics(); }
  beginStep(): void { this.metrics.beginStep(); }
  endStep(wallTimeMs: number) { return this.metrics.endStep(wallTimeMs); }

  dispose(): void {
    const nodes = this.effectNodes;
    for (let i = nodes.length - 1; i >= 0; --i) disposeWatcher(nodes[i]!);
    nodes.length = 0;
  }
}

const variants: readonly BenchVariant[] = [
  { label: "eager-walk",      createHarness: () => new ReflexHarness("eager-walk") },
  { label: "heap-ordering",   createHarness: () => new ReflexHarness("heap-ordering") },
  { label: "late-snapshot",   createHarness: () => new ReflexHarness("late-snapshot") },
  { label: "naive-host-queue",createHarness: () => new ReflexHarness("naive-host-queue") },
];

registerBenchFile("reflex", variants);