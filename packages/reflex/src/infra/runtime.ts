import {
  createRuntimeContext,
  enterReactiveBatch,
  flushPendingReactiveSettledIfIdle,
  getActiveRuntimeContext,
  hasPendingReactiveSettled,
  leaveReactiveBatch,
  runWithRuntimeContext,
  resetRuntimeContext,
  switchRuntimeContext,
  configureRuntimeContext,
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
  EffectSchedulerMode,
  Batching,
  Flushing,
  Idle,
  createEffectScheduler,
  enterSchedulerBatch,
  flushSchedulerQueue,
  hasPendingEffects,
  isContextSettled,
  leaveSchedulerBatch,
  profileSchedulerPolicyCounter,
  resolveEffectSchedulerMode,
} from "../policy/scheduler";

type BatchFn = <T>(fn: () => T) => T;
type EventFn = <T>() => EventSource<T>;

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
  const scheduler = createEffectScheduler(
    resolveEffectSchedulerMode(effectStrategy),
  );
  const schedulerCore = scheduler.core;
  const schedulerMode = scheduler.mode;
  const schedulerFlush = scheduler.flush;
  const run = <T>(fn: () => T): T => runWithRuntimeContext(execution, fn);
  const emitReactiveSettled = (): void => {
    profileSchedulerPolicyCounter("settleCalled");
    scheduler.runtimeNotifySettled?.();
    hooks?.reactiveSettledDispatcher?.();
  };
  const runFlushBatch = <T>(fn: () => T): T => {
    enterReactiveBatch();

    if (++schedulerCore.batchDepth === 1 && schedulerCore.phase !== Flushing) {
      schedulerCore.phase = Batching;
    }

    try {
      return fn();
    } finally {
      profileSchedulerPolicyCounter("batchExit");

      if (
        --schedulerCore.batchDepth === 0 &&
        schedulerCore.phase !== Flushing
      ) {
        schedulerCore.phase = Idle;
      }

      leaveReactiveBatch();

      if (hasPendingReactiveSettled()) {
        flushPendingReactiveSettledIfIdle();
      }
    }
  };
  const runScheduledBatch = <T>(fn: () => T): T => {
    enterReactiveBatch();
    enterSchedulerBatch(schedulerCore);

    try {
      return fn();
    } finally {
      profileSchedulerPolicyCounter("batchExit");

      const leftOuterSchedulerBatch = leaveSchedulerBatch(schedulerCore);

      if (leftOuterSchedulerBatch) {
        if (
          schedulerMode === EffectSchedulerMode.Eager &&
          hasPendingEffects(schedulerCore)
        ) {
          flushSchedulerQueue(schedulerCore);
        } else if (
          schedulerMode === EffectSchedulerMode.SAB &&
          hasPendingEffects(schedulerCore) &&
          isContextSettled()
        ) {
          flushSchedulerQueue(schedulerCore);
        }
      }

      leaveReactiveBatch();

      if (hasPendingReactiveSettled()) {
        flushPendingReactiveSettledIfIdle();
      }
    }
  };
  const runBatch =
    schedulerMode === EffectSchedulerMode.Flush
      ? runFlushBatch
      : runScheduledBatch;
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

  resetRuntimeContext(execution);

  configureRuntimeContext(execution, {
    hooks: {
      sinkInvalidatedDispatcher(node) {
        scheduler.enqueue(node);
        hooks?.sinkInvalidatedDispatcher?.(node);
      },
      reactiveSettledDispatcher() {
        emitReactiveSettled();
      },
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
