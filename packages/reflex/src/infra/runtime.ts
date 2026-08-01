import {
  createRuntimeContext,
  enterReactiveBatch,
  getActiveRuntimeContext,
  leaveReactiveBatch,
  runWithRuntimeContext,
  resetRuntimeContext,
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
import { EffectSchedulerMode } from "@volynets/reflex-scheduler";
import {
  hasPendingEffects,
  isContextSettled,
} from "@volynets/reflex-scheduler";
import { profileSchedulerPolicyCounter } from "@volynets/reflex-scheduler";
import {
  createSchedulerCore,
  enterSchedulerBatch,
  flushSchedulerQueue,
  leaveSchedulerBatch,
} from "@volynets/reflex-scheduler";
import { tryEnqueue } from "@volynets/reflex-scheduler";
import {
  notifyEffectSchedulerSettled,
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
  const schedulerMode = resolveEffectSchedulerMode(effectStrategy);
  const schedulerCore = createSchedulerCore();
  const schedulerFlush = (): void => flushSchedulerQueue(schedulerCore);
  const run = <T>(fn: () => T): T => runWithRuntimeContext(execution, fn);
  const emitRuntimeIdle = (): void => {
    profileSchedulerPolicyCounter("settleCalled");
    notifyEffectSchedulerSettled(schedulerCore, schedulerMode);
    hooks?.onRuntimeIdle?.();
  };
  const runBatch = <T>(fn: () => T): T => {
    // Public batching composes two independent boundaries. Close scheduler
    // policy first so a settled hook never observes it in Batching phase.
    enterReactiveBatch();
    enterSchedulerBatch(schedulerCore);

    let result!: T;
    let callbackError: unknown = NO_BATCH_ERROR;

    try {
      result = fn();
    } catch (error) {
      callbackError = error;
    }

    const exitErrors: unknown[] = [];
    profileSchedulerPolicyCounter("batchExit");

    try {
      const leftOuterSchedulerBatch = leaveSchedulerBatch(schedulerCore);

      if (
        leftOuterSchedulerBatch &&
        ((schedulerMode === EffectSchedulerMode.Eager &&
          hasPendingEffects(schedulerCore)) ||
          (schedulerMode === EffectSchedulerMode.SAB &&
            hasPendingEffects(schedulerCore) &&
            isContextSettled()))
      ) {
        flushSchedulerQueue(schedulerCore);
      }
    } catch (error) {
      exitErrors.push(error);
    } finally {
      try {
        leaveReactiveBatch();
      } catch (error) {
        exitErrors.push(error);
      }
    }

    if (callbackError !== NO_BATCH_ERROR) {
      exitErrors.unshift(callbackError);
    }

    if (exitErrors.length === 1) throw exitErrors[0];
    if (exitErrors.length > 1) {
      throw new AggregateError(exitErrors, "Reactive batch failed");
    }

    return result;
  };
  const runtimeBatch = <T>(fn: () => T): T => {
    const runContextBatch = (): T => runBatch(fn);

    if (getActiveRuntimeContext() === execution) {
      return runContextBatch();
    }

    return run(runContextBatch);
  };
  const flush = (): void => {
    if (getActiveRuntimeContext() === execution) {
      schedulerFlush();
      return;
    }

    run(schedulerFlush);
  };
  const dispatcher = createEventDispatcher(runtimeBatch);
  const externalNodeInvalidated = hooks?.onNodeInvalidated;
  const externalRuntimeIdle = hooks?.onRuntimeIdle;
  // Runtime invalidation hooks are enqueue-only. Eager delivery is owned by
  // the subsequent reactive-settled boundary, never by the propagation hook.
  const enqueueEffect = (node: ReactiveNode): void => {
    tryEnqueue(schedulerCore.queue, node);
  };
  const onNodeInvalidated =
    externalNodeInvalidated === undefined
      ? enqueueEffect
      : (node: ReactiveNode): void => {
          enqueueEffect(node);
          externalNodeInvalidated(node);
        };
  const onRuntimeIdle =
    schedulerMode === EffectSchedulerMode.Eager ||
    externalRuntimeIdle !== undefined
      ? emitRuntimeIdle
      : undefined;

  resetRuntimeContext(execution);

  configureRuntimeContext(execution, {
    hooks: {
      onNodeInvalidated,
      onRuntimeIdle,
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

  return {
    ctx,
    batch: runtimeBatch,
    event: activeEvent,
    flush,
  };
}

export const event: EventFn = <T>() => activeEvent<T>();

export const flush = (): void => activeFlush();

export { untracked };
