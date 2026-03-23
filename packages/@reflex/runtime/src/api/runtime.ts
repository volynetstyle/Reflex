import {
  ReactiveNode,
  EngineHooks,
  EngineContext,
  disposeEffect,
  UNINITIALIZED,
  ReactiveNodeState,
  runEffect,
  PRODUCER_CHANGED as PRODUCER_INITIAL_STATE,
  CONSUMER_CHANGED as CONSUMER_INITIAL_STATE,
  RECYCLER_CHANGED as RECYCLER_INITIAL_STATE,
  unlinkAllSubscribers,
} from "../reactivity";
import runtime from "../reactivity/context";
import {
  EffectStrategy,
  EffectScheduler,
  resolveEffectSchedulerMode,
} from "../scheduler/effect_scheduler";
import { EventDispatcher } from "../scheduler/event_dispatcher";
import { readConsumer, readProducer } from "./read";
import { writeProducer } from "./write";

// ─── Types ────────────────────────────────────────────────────────────────────
export type Dispose = () => void;

export interface Signal<T> {
  (): T;
  (value: T): void;
  /** Read without tracking. */
  untracked(): T;
  readonly node: ReactiveNode<T>;
}

export interface Scan<T> extends Computed<T> {
  read(): T;
  dispose(): void;
}

export interface Event<T> {
  subscribe(fn: (value: T) => void): Dispose;
}

export interface EventSource<T> extends Event<T> {
  emit(value: T): void;
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
  event<T>(): EventSource<T>;
  effect(fn: () => void | (() => void)): EffectScope;
  flush(): void;
  batchWrite(writes: ReadonlyArray<BatchWriteEntry>): void;
  readonly ctx: EngineContext;
}

// ─── Node factories ───────────────────────────────────────────────────────────

export function createSignalNode<T>(payload: T): ReactiveNode<T> {
  return new ReactiveNode(payload, null, PRODUCER_INITIAL_STATE);
}

export function createScanNode<T>(payload: T): ReactiveNode<T> {
  return new ReactiveNode(payload, null, PRODUCER_INITIAL_STATE);
}

export function createComputedNode<T>(compute: () => T): ReactiveNode<T> {
  return new ReactiveNode(UNINITIALIZED as T, compute, CONSUMER_INITIAL_STATE);
}

export function createEffectNode(
  compute: () => void | (() => void),
): ReactiveNode<void | (() => void)> {
  return new ReactiveNode(undefined, compute, RECYCLER_INITIAL_STATE);
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

export function memo<T>(fn: () => T): Computed<T> {
  const c = computed(fn);
  c();
  return c;
}

export function scan<T, A>(
  source: Event<T>,
  seed: A,
  reducer: (acc: A, value: T) => A,
) {
  return createScan(source, seed, reducer);
}

const self = <Acc, T>(_: Acc, value: T) => value;

export function hold<T>(source: Event<T>, initial: T) {
  return createScan(source, initial, self);
}

function createEventSource<T>(dispatcher: EventDispatcher): EventSource<T> {
  const source = dispatcher.createSource<T>();

  function subscribe(fn: (value: T) => void): Dispose {
    return dispatcher.subscribe(source, fn);
  }

  function emit(value: T): void {
    dispatcher.emit(source, value);
  }

  return { subscribe, emit };
}

function createScan<T, A>(
  source: Event<T>,
  seed: A,
  reducer: (acc: A, value: T) => A,
): Scan<A> {
  const node = createScanNode(seed);
  const read = () => readProducer(node);

  let unsubscribe: Dispose | undefined;

  const accessor = function (): A {
    return read();
  } as Scan<A>;

  unsubscribe = source.subscribe((value: T) => {
    if ((node.state & ReactiveNodeState.Disposed) !== 0) return;

    const next = reducer(node.pendingPayload as A, value);
    writeProducer(node, next);
  });

  function dispose(): void {
    if ((node.state & ReactiveNodeState.Disposed) !== 0) return;

    node.state |= ReactiveNodeState.Disposed;

    const stop = unsubscribe;
    unsubscribe = undefined;
    stop?.();

    unlinkAllSubscribers(node);
  }

  accessor.read = read;
  accessor.untracked = () => node.payload as A;
  accessor.dispose = dispose;
  (accessor as any).node = node;

  return accessor;
}

function createRuntimeInfrastructure(options?: RuntimeOptions) {
  const hooks = options?.hooks;
  const scheduler = new EffectScheduler(
    resolveEffectSchedulerMode(options?.effectStrategy),
  );

  const dispatcher = new EventDispatcher((fn) => scheduler.batch(fn));

  return {
    scheduler,
    dispatcher,
    runtimeHooks: {
      ...hooks,
      onEffectInvalidated(node: ReactiveNode) {
        scheduler.enqueue(node);
        hooks?.onEffectInvalidated?.(node);
      },
    },
  };
}

function createEffectScope(
  scheduler: EffectScheduler,
  fn: () => void,
): EffectScope {
  const node = createEffectNode(fn);
  runEffect(node);

  const scope = Object.assign(
    () => {
      scheduler.clear(node);
      disposeEffect(node);
    },
    {
      node,
      dispose() {
        scope();
      },
    },
  ) as EffectScope;

  return scope;
}

function applyBatchWrites(
  scheduler: EffectScheduler,
  writes: readonly (readonly [Signal<any>, any])[],
): void {
  scheduler.batch(() => {
    for (const [sig, value] of writes) {
      writeProducer(sig.node, value);
    }
  });
}

export function createRuntime(options?: RuntimeOptions): Runtime {
  const { scheduler, dispatcher, runtimeHooks } =
    createRuntimeInfrastructure(options);

  runtime.resetState();
  runtime.setHooks(runtimeHooks);

  return {
    event<T>() {
      return createEventSource<T>(dispatcher);
    },

    effect(fn) {
      return createEffectScope(scheduler, fn);
    },

    flush() {
      scheduler.flush();
    },

    batchWrite(writes) {
      applyBatchWrites(scheduler, writes);
    },

    get ctx() {
      return runtime;
    },
  };
}
