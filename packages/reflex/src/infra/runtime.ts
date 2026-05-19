import {
  createExecutionState,
  runWithExecutionState,
  resetState,
  setActiveExecutionState,
  setHooks,
  setRuntimeHooks,
} from "@volynets/reflex-runtime";
import type { EngineHooks, ExecutionState } from "@volynets/reflex-runtime";
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
  readonly execution: ExecutionState;
}

let activeBatch: BatchFn = (fn) => fn();
let activeEvent: EventFn = (() => {
  throw new Error("Runtime has not been created");
}) as EventFn;
let activeFlush: () => void = () => {};
let activeContext: RuntimeContext = {
  scope: "runtime",
  execution: createExecutionState(),
};

export interface RuntimeOptions {
  hooks?: EngineHooks;
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
  const execution = createExecutionState();
  const ctx: RuntimeContext = { scope: "runtime", execution };
  const scheduler = createEffectScheduler(
    resolveEffectSchedulerMode(effectStrategy),
  );
  const run = <T>(fn: () => T): T => runWithExecutionState(execution, fn);
  const batch = <T>(fn: () => T): T => run(() => scheduler.batch(fn));
  const flush = (): void => run(scheduler.flush.bind(scheduler));
  const dispatcher = createEventDispatcher(batch);

  setHooks(execution, hooks ?? {});

  setRuntimeHooks(
    execution,
    scheduler.enqueue.bind(scheduler),
    scheduler.runtimeNotifySettled,
  );

  resetState(execution);
  setActiveExecutionState(execution);
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
