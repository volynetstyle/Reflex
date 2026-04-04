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
  createExecutionContext,
  disposeWatcher,
  readConsumer,
  readProducer,
  ReactiveNode,
  ReactiveNodeState,
  runWatcher,
  WATCHER_INITIAL_STATE,
  PRODUCER_INITIAL_STATE,
  writeProducer,
} from "@reflex/runtime/debug";
import { isEffectScheduled } from "../src/api/effect";
import {
  EffectScheduler,
  resolveEffectSchedulerMode,
} from "../src/policy";

type EffectNode = ReactiveNode<unknown>;
const EFFECT_ID = Symbol("reflex.bench.effect_id");
type BenchEffectNode = EffectNode & { [EFFECT_ID]?: number };
type ReflexStrategy = "flush" | "eager";

const compareNumbers = (left: number, right: number) => Object.is(left, right);

class ReflexHarness implements BenchHarness {
  readonly metrics = new HarnessMetrics();
  private readonly disposers: Array<() => void> = [];
  private readonly context = createExecutionContext();
  private readonly scheduler: EffectScheduler;

  constructor(private readonly strategy: ReflexStrategy) {
    this.scheduler = new EffectScheduler(
      resolveEffectSchedulerMode(strategy),
      this.context,
    );

    this.context.setHooks({
      onEffectInvalidated: (node) => {
        this.scheduler.scheduleInvalidated(node);
      },
      onReactiveSettled: () => {
        if (!this.scheduler.isFlushing()) {
          this.scheduler.notifySettled();
        }
      },
    });

    this.instrumentScheduler();
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
        this.flush()
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
    const effectId = this.metrics.allocateEffectId();

    const node = new ReactiveNode<unknown>(
      null,
      () => {
        this.metrics.recordRecompute();
        this.metrics.recordEffectRun(effectId);
        blackhole(read());
      },
      WATCHER_INITIAL_STATE,
    );

    (node as BenchEffectNode)[EFFECT_ID] = effectId;
    runWatcher(node, this.context);

    const dispose = () => disposeWatcher(node);
    this.disposers.push(dispose);
    return dispose;
  }

  batch<T>(fn: () => T): T {
    this.metrics.recordSchedulerOp();

    try {
      return this.scheduler.batch(fn);
    } finally {
      this.metrics.recordSchedulerOp();
    }
  }

  flush(): void {
    if (this.strategy === "eager") return;

    this.metrics.recordSchedulerOp();
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

  private instrumentScheduler(): void {
    const scheduler = this.scheduler;

    const enqueue = scheduler.enqueue.bind(scheduler);
    scheduler.enqueue = (node) => {
      const effectNode = node as EffectNode;

      if ((effectNode.state & ReactiveNodeState.Disposed) !== 0) {
        enqueue(node);
        return;
      }

      const effectId = (effectNode as BenchEffectNode)[EFFECT_ID] ?? 0;
      if (isEffectScheduled(effectNode as never)) {
        this.metrics.recordEnqueue(effectId, false);
        enqueue(node);
        return;
      }

      this.metrics.recordEnqueue(effectId, true);
      this.metrics.recordEnqueueAllocation();
      enqueue(node);
    };
  }
}

const variants: readonly BenchVariant[] = [
  {
    label: "reflex-flush",
    createHarness: () => new ReflexHarness("flush"),
  },
  {
    label: "reflex-eager",
    createHarness: () => new ReflexHarness("eager"),
  },
];

registerBenchFile("reflex", variants);
