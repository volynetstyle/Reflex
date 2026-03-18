import runtime, { EngineContext, type EngineHooks } from "../runtime";
import {
  createComputedNode,
  createEffectNode,
  createSignalNode,
  getNodeContext,
  isDirtyState,
  type ReactiveNode,
} from "../core";
import { ensureFresh } from "../reactivity/walkers/pullAndRecompute";
import { trackRead } from "../reactivity/tracking";
import { runEffect, disposeEffect } from "../reactivity/engine/effect";
import { applyProducerWrite, writeProducer } from "./write";
import {
  EffectScheduler,
  resolveEffectSchedulerMode,
  type EffectStrategy,
} from "../scheduler/effect_scheduler";

export interface Signal<T> {
  readonly node: ReactiveNode;
  read(): T;
  write(value: T): void;
}

export interface Computed<T> {
  readonly node: ReactiveNode;
  (): T;
}

export interface EffectScope {
  readonly node: ReactiveNode;
  dispose(): void;
}

export type BatchWriteEntry = readonly [Signal<unknown>, unknown];

export interface RuntimeOptions {
  hooks?: EngineHooks;
  effectStrategy?: EffectStrategy;
}

export interface Runtime {
  signal<T>(value: T): Signal<T>;
  computed<T>(fn: () => T): Computed<T>;
  memo<T>(fn: () => T): Computed<T>;
  effect(fn: () => void | (() => void)): EffectScope;
  flush(): void;
  batchWrite(writes: ReadonlyArray<BatchWriteEntry>): void;
  readonly ctx: EngineContext;
}

function readTrackedValue<T>(node: ReactiveNode): T {
  if (runtime.activeComputed) {
    trackRead(node);
  }

  return node.payload as T;
}

function createComputedAccessor<T>(node: ReactiveNode): Computed<T> {
  const computed = function () {
    if (isDirtyState(node.state) || node.v === 0) {
      ensureFresh(node);
    }

    return readTrackedValue<T>(node);
  } as Computed<T>;

  (computed as { node: ReactiveNode }).node = node;
  return computed;
}

class SignalImpl<T> implements Signal<T> {
  constructor(public readonly node: ReactiveNode) {}

  read(): T {
    return readTrackedValue<T>(this.node);
  }

  write(value: T): void {
    writeProducer(this.node, value);
  }
}

export function createRuntime(options?: RuntimeOptions): Runtime {
  const userHooks = options?.hooks;
  const effectScheduler = new EffectScheduler(
    resolveEffectSchedulerMode(options?.effectStrategy),
  );
  runtime.reset({
    ...userHooks,
    onEffectInvalidated: (node) => {
      effectScheduler.enqueue(node);
      userHooks?.onEffectInvalidated?.(node);
    },
  });

  return {
    signal<T>(initialValue: T): Signal<T> {
      return new SignalImpl(createSignalNode(initialValue));
    },

    computed<T>(fn: () => T): Computed<T> {
      return createComputedAccessor<T>(createComputedNode(fn));
    },

    memo<T>(fn: () => T): Computed<T> {
      const computed = createComputedAccessor<T>(createComputedNode(fn));
      computed();
      return computed;
    },

    effect(fn: () => void | (() => void)): EffectScope {
      const node = createEffectNode(fn);
      runEffect(node);

      return {
        node,
        dispose: () => {
          effectScheduler.clear(node);
          disposeEffect(node);
        },
      };
    },

    flush(): void {
      effectScheduler.flush();
    },

    batchWrite(writes: ReadonlyArray<BatchWriteEntry>): void {
      const epoch = runtime.bumpEpoch();

      for (const [signal, value] of writes) {
        applyProducerWrite(signal.node, value, epoch);
      }
    },

    get ctx() {
      return runtime;
    },
  };
}
