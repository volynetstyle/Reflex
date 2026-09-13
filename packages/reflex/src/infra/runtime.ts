import {
  createRuntimeContext,
  enterReactiveBatch,
  getActiveRuntimeContext,
  leaveReactiveBatch,
  runWithRuntimeContext,
  switchRuntimeContext,
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

  const execution = createRuntimeContext({
    hooks: { onRuntimeIdle: hooks?.onRuntimeIdle },
  });
  const ctx: RuntimeContext = { scope: "runtime", execution };
  const schedulerMode = resolveEffectSchedulerMode(effectStrategy);
  const scheduler = createRuntimeSchedulerBinding(schedulerMode, execution);
  const runBatch = <T>(fn: () => T): T => {
    // Public batching composes two independent boundaries. Close scheduler
    // policy first so a settled hook never observes it in Batching phase.
    enterReactiveBatch();
    scheduler.enterBatch();

    let errors: unknown[] | undefined;

    try {
      return fn();
    } catch (error) {
      errors = [error];
      throw error;
    } finally {
      try {
        scheduler.leaveBatch();
      } catch (error) {
        (errors ??= []).push(error);
      }
      try {
        leaveReactiveBatch();
      } catch (error) {
        (errors ??= []).push(error);
      }

      if (errors !== undefined) {
        if (errors.length === 1) throw errors[0];
        throw new AggregateError(errors, "Reactive batch failed");
      }
    }
  };
  const runtimeBatch = <T>(fn: () => T): T => {
    if (getActiveRuntimeContext() === execution) {
      return runBatch(fn);
    }

    return runWithRuntimeContext(execution, () => runBatch(fn));
  };
  const flush = (): void => {
    if (getActiveRuntimeContext() === execution) {
      scheduler.flush();
      return;
    }

    runWithRuntimeContext(execution, scheduler.flush);
  };
  const dispatcher = createEventDispatcher(runtimeBatch);
  const externalNodeInvalidated = hooks?.onNodeInvalidated;
  // Runtime invalidation hooks are enqueue-only. Eager delivery is owned by
  // the subsequent reactive-settled boundary, never by the propagation hook.
  const enqueueEffect = scheduler.onNodeInvalidated;
  execution.nodeInvalidatedHook =
    externalNodeInvalidated === undefined
      ? enqueueEffect
      : (node: ReactiveNode): void => {
          enqueueEffect(node);
          externalNodeInvalidated(node);
        };

  // The new context is still inactive; install the trusted scheduler hooks
  // before its first load, without another configuration/normalization pass.
  execution.hostFlushHook = scheduler.onHostFlush;

  switchRuntimeContext(execution);
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
