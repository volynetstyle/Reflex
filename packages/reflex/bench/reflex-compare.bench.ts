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
  type ExecutionContext,
  WATCHER_INITIAL_STATE,
  writeProducer,
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
    if (this.items.length === 0) return undefined;

    const top = this.items[0];
    const last = this.items.pop();

    if (last !== undefined && this.items.length !== 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }

    return top;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(index, parent) <= 0) return;
      this.swap(index, parent);
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.items.length;

    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let best = index;

      if (left < length && this.compare(left, best) > 0) {
        best = left;
      }
      if (right < length && this.compare(right, best) > 0) {
        best = right;
      }
      if (best === index) return;

      this.swap(index, best);
      index = best;
    }
  }

  private compare(leftIndex: number, rightIndex: number): number {
    const left = this.items[leftIndex]!;
    const right = this.items[rightIndex]!;

    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    return right.order - left.order;
  }

  private swap(leftIndex: number, rightIndex: number): void {
    const left = this.items[leftIndex]!;
    this.items[leftIndex] = this.items[rightIndex]!;
    this.items[rightIndex] = left;
  }
}

class ReflexScheduler {
  private readonly fifo: EffectNode[] = [];
  private readonly heap = new EffectHeap();
  private head = 0;
  private batchDepth = 0;
  private flushing = false;
  private order = 0;

  constructor(
    private readonly mode: ReflexMode,
    private readonly context: ExecutionContext,
    private readonly metrics: HarnessMetrics,
    private readonly priorities: WeakMap<EffectNode, number>,
  ) {}

  batch<T>(fn: () => T): T {
    ++this.batchDepth;

    try {
      return fn();
    } finally {
      --this.batchDepth;
      this.maybeAutoFlush();
    }
  }

  enqueue(node: EffectNode): void {
    this.metrics.recordSchedulerOp();

    const dedupe = this.mode !== "naive-host-queue";
    if (dedupe && (node.state & ReactiveNodeState.Scheduled) !== 0) {
      this.metrics.recordSchedulerOp();
      return;
    }

    if (dedupe) {
      node.state |= ReactiveNodeState.Scheduled;
    }

    this.metrics.recordStepAllocation();

    if (this.mode === "heap-ordering") {
      this.heap.push({
        node,
        order: this.order++,
        priority: this.priorities.get(node) ?? 0,
      });
    } else {
      this.fifo.push(node);
    }

    this.maybeAutoFlush();
  }

  flush(): void {
    if (this.flushing || !this.hasPending()) return;

    this.flushing = true;
    this.metrics.recordSchedulerOp();

    try {
      while (true) {
        const node = this.takeNext();
        if (node === null) break;

        this.metrics.recordSchedulerOp();

        if (this.mode !== "naive-host-queue") {
          node.state &= ~ReactiveNodeState.Scheduled;
        }

        if ((node.state & ReactiveNodeState.Disposed) !== 0) continue;
        if ((node.state & DIRTY_STATE) === 0) continue;

        runWatcher(node, this.context);
      }
    } finally {
      this.fifo.length = 0;
      this.head = 0;
      this.flushing = false;
    }
  }

  notifySettled(): void {
    this.maybeAutoFlush();
  }

  private hasPending(): boolean {
    return this.mode === "heap-ordering"
      ? this.heap.size > 0
      : this.head < this.fifo.length;
  }

  private takeNext(): EffectNode | null {
    if (this.mode === "heap-ordering") {
      return this.heap.pop()?.node ?? null;
    }

    if (this.head >= this.fifo.length) {
      return null;
    }

    return this.fifo[this.head++] ?? null;
  }

  private maybeAutoFlush(): void {
    if (this.mode !== "eager-walk") return;
    if (this.flushing) return;
    if (this.batchDepth !== 0) return;
    if (this.context.propagationDepth !== 0) return;
    if (this.context.activeComputed !== null) return;
    if (!this.hasPending()) return;

    this.flush();
  }
}

class ReflexHarness implements BenchHarness {
  readonly metrics = new HarnessMetrics();
  private readonly priorities = new WeakMap<EffectNode, number>();
  private readonly disposers: Array<() => void> = [];
  private readonly context: ExecutionContext;
  private readonly scheduler: ReflexScheduler;

  constructor(mode: ReflexMode) {
    this.context = createExecutionContext();
    this.scheduler = new ReflexScheduler(
      mode,
      this.context,
      this.metrics,
      this.priorities,
    );

    this.context.setHooks({
      onEffectInvalidated: (node) => {
        this.scheduler.enqueue(node as EffectNode);
      },
      onReactiveSettled: () => {
        this.scheduler.notifySettled();
      },
    });
  }

  signal(
    initial: number,
    _label?: string,
  ): readonly [() => number, (value: WriteInput) => void] {
    this.metrics.recordSetupAllocation();

    const node = new ReactiveNode<number>(
      initial,
      null,
      PRODUCER_INITIAL_STATE,
    );

    return [
      () => readProducer(node, this.context),
      (value) => {
        this.metrics.recordSchedulerOp();
        const next =
          typeof value === "function"
            ? value(readProducer(node, this.context))
            : value;
        writeProducer(node, next, compareNumbers, this.context);
      },
    ] as const;
  }

  memo(fn: () => number, _label?: string): () => number {
    this.metrics.recordSetupAllocation();

    const node = new ReactiveNode<number>(
      0,
      () => {
        this.metrics.recordRecompute();
        return fn();
      },
      CONSUMER_INITIAL_STATE,
    );

    return () => {
      this.metrics.recordRefresh();
      return readConsumer(node, ConsumerReadMode.lazy, this.context);
    };
  }

  effect(read: () => number, meta?: EffectMeta): () => void {
    this.metrics.recordSetupAllocation();

    const node = new ReactiveNode<unknown>(
      null,
      () => {
        this.metrics.recordRecompute();
        this.metrics.recordEffectRun();
        blackhole(read());
      },
      WATCHER_INITIAL_STATE,
    );

    this.priorities.set(node, meta?.priority ?? 0);
    runWatcher(node, this.context);

    const dispose = () => disposeWatcher(node);
    this.disposers.push(dispose);
    return dispose;
  }

  batch<T>(fn: () => T): T {
    return this.scheduler.batch(fn);
  }

  flush(): void {
    this.scheduler.flush();
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
    for (let index = this.disposers.length - 1; index >= 0; --index) {
      this.disposers[index]!();
    }
    this.disposers.length = 0;
  }
}

const variants: readonly BenchVariant[] = [
  {
    label: "eager-walk",
    createHarness: () => new ReflexHarness("eager-walk"),
  },
  {
    label: "heap-ordering",
    createHarness: () => new ReflexHarness("heap-ordering"),
  },
  {
    label: "late-snapshot",
    createHarness: () => new ReflexHarness("late-snapshot"),
  },
  {
    label: "naive-host-queue",
    createHarness: () => new ReflexHarness("naive-host-queue"),
  },
];

registerBenchFile("reflex", variants);