import {
  createRuntimeContext,
  runWithRuntimeContext,
  resetState,
  setActiveRuntimeContext,
  setRuntimeHooks,
  untracked,
} from "@volynets/reflex-runtime/internal";
import type {
  RuntimeContext as RuntimeExecutionContext,
  RuntimeHostHooks,
} from "@volynets/reflex-runtime/internal";
import { subscribeEvent } from "./event";
import { createSource } from "./factory";
import { createEventDispatcher } from "../policy";
import type { EffectStrategy } from "../policy/scheduler";
import {
  createEffectScheduler,
  resolveEffectSchedulerMode,
} from "../policy/scheduler";

type BatchFn = <T>(fn: () => T) => T;
type EventFn = <T>() => EventSource<T>;

export interface RuntimeContext {
  readonly scope: "runtime";
  readonly execution: RuntimeExecutionContext;
}

let activeBatch: BatchFn = (fn) => fn();
let activeEvent: EventFn = (() => {
  throw new Error("Runtime has not been created");
}) as EventFn;
let activeFlush: () => void = () => {};
let activeContext: RuntimeContext = {
  scope: "runtime",
  execution: createRuntimeContext(),
};

export interface RuntimeOptions {
  hooks?: RuntimeHostHooks;
  effectStrategy?: EffectStrategy;
}

export interface Event<T> {
  subscribe(fn: (value: T) => void): Destructor;
}

export interface EventSource<T> extends Event<T> {
  emit(value: T): void;
}

export interface Runtime {
  batch<T>(fn: () => T): T;
  event<T>(): EventSource<T>;
  flush(): void;
  readonly ctx: RuntimeContext;
}

export function createRuntime({
  hooks,
  effectStrategy,
}: RuntimeOptions = {}): Runtime {
  const execution = createRuntimeContext();
  const ctx: RuntimeContext = { scope: "runtime", execution };
  const scheduler = createEffectScheduler(
    resolveEffectSchedulerMode(effectStrategy),
  );
  const run = <T>(fn: () => T): T => runWithRuntimeContext(execution, fn);
  const batch = <T>(fn: () => T): T => run(() => scheduler.batch(fn));
  const flush = (): void => run(scheduler.flush);
  const dispatcher = createEventDispatcher(batch);

  resetState(execution);

  setRuntimeHooks(execution, {
    effectCleanupRegistrar: hooks?.effectCleanupRegistrar,
    sinkInvalidatedDispatcher(node) {
      scheduler.enqueue(node);
      hooks?.sinkInvalidatedDispatcher?.(node);
    },
    reactiveSettledDispatcher() {
      scheduler.runtimeNotifySettled?.();
      hooks?.reactiveSettledDispatcher?.();
    },
  });

  setActiveRuntimeContext(execution);
  activeContext = ctx;
  activeBatch = batch;
  activeEvent = function <T>() {
    const source = createSource<T>();

    return {
      subscribe(fn: (value: T) => void) {
        return subscribeEvent(source, fn);
      },
      emit(value: T) {
        dispatcher.emit(source, value);
      },
    };
  };
  activeFlush = flush;

  return {
    ctx: activeContext,
    batch: activeBatch,
    event: activeEvent,
    flush: activeFlush,
  };
}

export const batch: BatchFn = <T>(fn: () => T) => activeBatch(fn);

export const event: EventFn = <T>() => activeEvent<T>();

export const flush = (): void => activeFlush();

export { untracked };
