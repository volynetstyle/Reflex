import {
  ReactiveNode,
  EngineHooks,
  EngineContext,
  disposeEffect,
  ReactiveNodeKind,
  UNINITIALIZED,
  CHANGED_STATE,
  ReactiveNodeState,
  runEffect,
  DIRTY_STATE,
} from "../reactivity";
import runtime from "../reactivity/context";
import {
  EffectStrategy,
  EffectScheduler,
  resolveEffectSchedulerMode,
} from "../scheduler/effect_scheduler";
import { readConsumer, readProducer } from "./read";
import { writeProducer } from "./write";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Signal<T> {
  (): T;
  (value: T): void;
  /** Read without tracking. */
  untracked(): T;
  readonly node: ReactiveNode<T>;
}

export interface Computed<T> {
  (): T;
  /** Read without tracking. */
  untracked(): T;
  readonly node: ReactiveNode<T>;
}

export interface EffectScope {
  (): void;
  dispose(): void;
  readonly node: ReactiveNode;
}

export type BatchWriteEntry = readonly [Signal<unknown>, unknown];

export interface RuntimeOptions {
  hooks?: EngineHooks;
  effectStrategy?: EffectStrategy;
}

export interface Runtime {
  effect(fn: () => void | (() => void)): EffectScope;
  flush(): void;
  batchWrite(writes: ReadonlyArray<BatchWriteEntry>): void;
  readonly ctx: EngineContext;
}

// ─── Node factories ───────────────────────────────────────────────────────────

export function createSignalNode<T>(payload: T): ReactiveNode<T> {
  return new ReactiveNode(payload, null, 0, ReactiveNodeKind.Signal);
}

export function createComputedNode<T>(compute: () => T): ReactiveNode<T> {
  return new ReactiveNode(
    UNINITIALIZED as T,
    compute,
    DIRTY_STATE,
    ReactiveNodeKind.Computed,
  );
}

export function createEffectNode(
  compute: () => void | (() => void),
): ReactiveNode<void | (() => void)> {
  return new ReactiveNode(
    undefined,
    compute,
    CHANGED_STATE | ReactiveNodeState.SideEffect,
    ReactiveNodeKind.Effect,
  );
}

// ─── Standalone signal / computed ────────────────────────────────────────────
// Не требуют Runtime — работают напрямую через node.

export function signal<T>(value: T): Signal<T> {
  const node = createSignalNode(value);

  function accessor(v?: T) {
    if (v === undefined && arguments.length === 0) return readProducer(node);
    writeProducer(node, v as T);
  }

  accessor.untracked = () => node.payload;
  accessor.node = node;

  return accessor as Signal<T>;
}

export function computed<T>(fn: () => T): Computed<T> {
  const node = createComputedNode(fn);

  function accessor() {
    return readConsumer(node);
  }

  accessor.untracked = () => node.payload;
  accessor.node = node;

  return accessor as Computed<T>;
}

/** Computed, вычисленный немедленно. */
export function memo<T>(fn: () => T): Computed<T> {
  const c = computed(fn);
  c();
  return c;
}

// ─── Runtime (только эффекты + flush) ────────────────────────────────────────

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
    effect(fn) {
      const node = createEffectNode(fn);
      runEffect(node);

      const dispose = Object.assign(
        () => {
          scheduler.clear(node);
          disposeEffect(node);
        },
        {
          node,
          dispose() {
            dispose();
          },
        },
      ) as EffectScope;

      return dispose;
    },

    flush: () => scheduler.flush(),

    batchWrite(writes) {
      for (const [sig, value] of writes) writeProducer(sig.node, value);
    },

    get ctx() {
      return runtime;
    },
  };
}
