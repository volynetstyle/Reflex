import {
  createRuntimeContext,
  enterReactiveBatch,
  getActiveRuntimeContext,
  leaveReactiveBatch,
  runWithRuntimeContext,
  switchRuntimeContext,
  configureRuntimeContext,
  untracked,
} from "@volynets/reflex-runtime/internal";
import type {
  ReactiveNode,
  RuntimeContext as RuntimeExecutionContext,
  RuntimeHostHooks,
} from "@volynets/reflex-runtime/internal";
import { subscribeEvent } from "./event";
import { createSource } from "./factory";
import { createEventDispatcher } from "../policy";
import {
  createRuntimeSchedulerBinding,
  resolveEffectSchedulerMode,
} from "@volynets/reflex-scheduler";
import type { EffectStrategy } from "@volynets/reflex-scheduler";

type BatchFn = <T>(fn: () => T) => T;
type EventFn = <T>() => EventSource<T>;
const NO_BATCH_ERROR: unique symbol = Symbol("NO_BATCH_ERROR");

export interface RuntimeContext {
  readonly scope: "runtime";
  readonly execution: RuntimeExecutionContext;
}

export let batch: BatchFn = <T>(fn: () => T): T => fn();
let activeEvent: EventFn = (() => {
  throw new Error("Runtime has not been created");
}) as EventFn;
let activeFlush: () => void = () => {};
let activeHasPending: () => boolean = () => false;
const retiredPendingSchedulers: Array<{
  flush: () => void;
  hasPending: () => boolean;
}> = [];

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
  if (activeHasPending()) {
    retiredPendingSchedulers.push({
      flush: activeFlush,
      hasPending: activeHasPending,
    });
  }

  const execution = createRuntimeContext();
  const ctx: RuntimeContext = { scope: "runtime", execution };
  const schedulerMode = resolveEffectSchedulerMode(effectStrategy);
  const scheduler = createRuntimeSchedulerBinding(schedulerMode, execution);
  const run = <T>(fn: () => T): T => runWithRuntimeContext(execution, fn);
  const runBatch = <T>(fn: () => T): T => {
    // Public batching composes two independent boundaries. Close scheduler
    // policy first so a settled hook never observes it in Batching phase.
    enterReactiveBatch();
    scheduler.enterBatch();

    let result!: T;
    let callbackError: unknown = NO_BATCH_ERROR;

    try {
      result = fn();
    } catch (error) {
      callbackError = error;
    }

    let exitErrors: unknown[] | undefined;

    try {
      scheduler.leaveBatch();
    } catch (error) {
      (exitErrors ??= []).push(error);
    } finally {
      try {
        leaveReactiveBatch();
      } catch (error) {
        (exitErrors ??= []).push(error);
      }
    }

    if (callbackError !== NO_BATCH_ERROR) {
      if (exitErrors === undefined) throw callbackError;
      exitErrors.unshift(callbackError);
    }

    if (exitErrors === undefined) return result;
    if (exitErrors.length === 1) throw exitErrors[0];
    throw new AggregateError(exitErrors, "Reactive batch failed");
  };
  const runtimeBatch = <T>(fn: () => T): T => {
    if (getActiveRuntimeContext() === execution) {
      return runBatch(fn);
    }

    return run(() => runBatch(fn));
  };
  const flush = (): void => {
    if (getActiveRuntimeContext() === execution) {
      scheduler.flush();
      return;
    }

    run(scheduler.flush);
  };
  const dispatcher = createEventDispatcher(runtimeBatch);
  const externalNodeInvalidated = hooks?.onNodeInvalidated;
  const externalRuntimeIdle = hooks?.onRuntimeIdle;
  // Runtime invalidation hooks are enqueue-only. Eager delivery is owned by
  // the subsequent reactive-settled boundary, never by the propagation hook.
  const enqueueEffect = scheduler.onNodeInvalidated;
  const onNodeInvalidated =
    externalNodeInvalidated === undefined
      ? enqueueEffect
      : (node: ReactiveNode): void => {
          enqueueEffect(node);
          externalNodeInvalidated(node);
        };
  const onRuntimeIdle = externalRuntimeIdle;

  configureRuntimeContext(execution, {
    hooks: {
      onNodeInvalidated,
      onRuntimeIdle,
    },
    scheduler: {
      onHostFlush: scheduler.onHostFlush,
    },
  });

  switchRuntimeContext(execution);
  // activeContext = ctx;
  batch = runBatch;
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
  activeHasPending = scheduler.hasPending;

  return {
    ctx,
    batch: runtimeBatch,
    event: activeEvent,
    flush,
  };
}

export const event: EventFn = <T>() => activeEvent<T>();

export const flush = (): void => {
  while (retiredPendingSchedulers.length !== 0) {
    const retired = retiredPendingSchedulers.shift()!;
    if (retired.hasPending()) retired.flush();
  }

  activeFlush();
};

export { untracked };
