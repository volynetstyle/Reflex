import runtime, { EngineContext, type EngineHooks } from "../runtime";

import { runEffect, disposeEffect } from "../reactivity/engine/effect";
import { applyProducerWrite, writeProducer } from "./write";
import { readConsumer, readProducer } from "./read";
import {
  EffectScheduler,
  resolveEffectSchedulerMode,
  type EffectStrategy,
} from "../scheduler/effect_scheduler";
import {
  ReactiveNode,
  createSignalNode,
  createComputedNode,
  createEffectNode,
} from "../reactivity/shape";

const NO_WRITE: unique symbol = Symbol("NO_WRITE");

export interface Signal<T> {
  (): T;
  (value: T): void;
  readonly node: ReactiveNode;
  read(): T;
  write(value: T): void;
}

export interface Computed<T> {
  read(): T;
  readonly node: ReactiveNode;
  (): T;
}

export interface EffectScope {
  (): void;
  readonly node: ReactiveNode;
  dispose(): void;
}

type MutableSignal<T> = Signal<T> & { node: ReactiveNode };
type MutableComputed<T> = Computed<T> & { node: ReactiveNode };
type MutableEffectScope = EffectScope & { node: ReactiveNode };

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

function createComputedAccessor<T>(node: ReactiveNode<T>): Computed<T> {
  const fn = (() => readConsumer<T>(node)) as MutableComputed<T>;

  fn.node = node;
  fn.read = fn;
  return fn;
}

function createSignalAccessor<T>(node: ReactiveNode<T>): Signal<T> {
  const signal = ((value: T | typeof NO_WRITE = NO_WRITE) => {
    if (value === NO_WRITE) {
      return readProducer<T>(node);
    }

    writeProducer(node, value);
  }) as MutableSignal<T>;

  signal.node = node;
  signal.read = () => signal();
  signal.write = (value: T) => {
    signal(value);
  };

  return signal;
}

function createEffectScope(node: ReactiveNode, scheduler: EffectScheduler): EffectScope {
  const dispose = (() => {
    scheduler.clear(node);
    disposeEffect(node);
  }) as MutableEffectScope;

  dispose.node = node;
  dispose.dispose = dispose;

  return dispose;
}

export function createRuntime(options?: RuntimeOptions): Runtime {
  const hooks = options?.hooks;

  const scheduler = new EffectScheduler(
    resolveEffectSchedulerMode(options?.effectStrategy),
  );

  runtime.reset({
    ...hooks,
    onEffectInvalidated: (node) => {
      scheduler.enqueue(node);
      hooks?.onEffectInvalidated?.(node);
    },
  });

  return {
    signal<T>(value: T): Signal<T> {
      return createSignalAccessor(createSignalNode(value));
    },

    computed<T>(fn: () => T): Computed<T> {
      return createComputedAccessor(createComputedNode(fn));
    },

    memo<T>(fn: () => T): Computed<T> {
      const c = createComputedAccessor<T>(createComputedNode(fn));
      c(); // eager
      return c;
    },

    effect(fn: () => void | (() => void)): EffectScope {
      const node = createEffectNode(fn);
      runEffect(node);
      return createEffectScope(node, scheduler);
    },

    flush: () => scheduler.flush(),

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
