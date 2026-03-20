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
} from "../reactivity";
import runtime from "../reactivity/context";
import {
  EffectStrategy,
  EffectScheduler,
  resolveEffectSchedulerMode,
} from "../scheduler/effect_scheduler";
import { readConsumer, readProducer } from "./read";
import { writeProducer } from "./write";

const NO_WRITE: unique symbol = Symbol("NO_WRITE");

export interface Signal<T> {
  (): T;
  (value: T): void;
  untracked(): T;
  readonly node: ReactiveNode;
  read(): T;
  write(value: T): void;
}

export interface Computed<T> {
  (): T;
  read(): T;
  untracked(): T;
  readonly node: ReactiveNode;
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
  signal<T>(value: T): Signal<T>;
  computed<T>(fn: () => T): Computed<T>;
  memo<T>(fn: () => T): Computed<T>;
  effect(fn: () => void | (() => void)): EffectScope;
  flush(): void;
  batchWrite(writes: ReadonlyArray<BatchWriteEntry>): void;
  readonly ctx: EngineContext;
}

function attachNode<T extends Function, N>(fn: T, node: N): T & { node: N } {
  return Object.assign(fn, { node });
}

function createComputedAccessor<T>(node: ReactiveNode<T>): Computed<T> {
  const accessor = attachNode((() => readConsumer(node)) as Computed<T>, node);
    accessor.untracked = () => node.payload;
  accessor.read = accessor;
  return accessor;
}

function createSignalAccessor<T>(node: ReactiveNode<T>): Signal<T> {
  const accessor = attachNode(
    ((value: T | typeof NO_WRITE = NO_WRITE) => {
      if (value === NO_WRITE) return readProducer(node);
      writeProducer(node, value);
    }) as Signal<T>,
    node,
  );

  accessor.untracked = () => node.payload;
  accessor.read = () => readProducer(node);
  accessor.write = (value: T) => writeProducer(node, value);

  return accessor;
}

function createEffectScope(
  node: ReactiveNode,
  scheduler: EffectScheduler,
): EffectScope {
  const dispose = attachNode(
    (() => {
      scheduler.clear(node);
      disposeEffect(node);
    }) as EffectScope,
    node,
  );

  dispose.dispose = dispose;

  return dispose;
}

export function createSignalNode<T>(payload: T): ReactiveNode<T> {
  return new ReactiveNode(payload, null, 0, ReactiveNodeKind.Signal);
}

export function createComputedNode<T>(compute: () => T): ReactiveNode<T> {
  return new ReactiveNode(
    UNINITIALIZED as T,
    compute,
    CHANGED_STATE,
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

  const computed = <T>(fn: () => T): Computed<T> =>
    createComputedAccessor(createComputedNode(fn));

  return {
    signal: <T>(value: T) => createSignalAccessor(createSignalNode(value)),

    computed,

    memo: <T>(fn: () => T) => {
      const c = computed(fn);
      c();
      return c;
    },

    effect: (fn) => {
      const node = createEffectNode(fn);
      runEffect(node);
      return createEffectScope(node, scheduler);
    },

    flush: () => scheduler.flush(),

    batchWrite: (writes) => {
      for (const [signal, value] of writes) {
        writeProducer(signal.node, value);
      }
    },

    get ctx() {
      return runtime;
    },
  };
}
