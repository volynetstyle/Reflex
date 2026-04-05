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
} from "@reflex/runtime";

type EffectNode = ReactiveNode<unknown>;

const compareNumbers = (left: number, right: number) => Object.is(left, right);

class ReflexScheduler {
  private readonly queue: EffectNode[] = [];
  private head = 0;
  private flushing = false;

  constructor(private readonly metrics: HarnessMetrics) {}

  enqueue(node: EffectNode): void {
    this.metrics.recordSchedulerOp();
    this.metrics.recordStepAllocation();
    this.queue.push(node);
  }

  flush(): void {
    if (this.flushing || this.head >= this.queue.length) return;

    this.flushing = true;
    this.metrics.recordSchedulerOp();

    try {
      while (this.head < this.queue.length) {
        const node = this.queue[this.head++]!;

        this.metrics.recordSchedulerOp();

        if ((node.state & ReactiveNodeState.Disposed) !== 0) continue;
        if ((node.state & DIRTY_STATE) === 0) continue;

        runWatcher(node);
      }
    } finally {
      this.queue.length = 0;
      this.head = 0;
      this.flushing = false;
    }
  }
}

class ReflexHarness implements BenchHarness {
  readonly metrics = new HarnessMetrics();
  private readonly disposers: Array<() => void> = [];
  private readonly scheduler: ReflexScheduler;
  private readonly context: ExecutionContext;

  constructor() {
    this.context = createExecutionContext({
      onEffectInvalidated: (node) => {
        this.scheduler.enqueue(node as EffectNode);
      },
    })
    this.scheduler = new ReflexScheduler(this.metrics);
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
      () => readProducer(node),
      (value) => {
        this.metrics.recordSchedulerOp();
        const next = typeof value === "function" ? value(readProducer(node, this.context)) : value;
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

  effect(read: () => number, _meta?: { label?: string; priority?: number }): () => void {
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

    runWatcher(node, this.context);

    const dispose = () => disposeWatcher(node);
    this.disposers.push(dispose);
    return dispose;
  }

  batch<T>(fn: () => T): T {
    return fn();
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
    label: "reflex-signals",
    createHarness: () => new ReflexHarness(),
  },
];

registerBenchFile("reflex", variants);
