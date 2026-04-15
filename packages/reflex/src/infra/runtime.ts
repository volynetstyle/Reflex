import { createExecutionContext, setDefaultContext } from "@reflex/runtime";
import type { ExecutionContext, EngineHooks } from "@reflex/runtime";
import { subscribeEvent } from "./event";
import { createSource } from "./factory";
import { EventDispatcher } from "../policy";
import type { EffectStrategy } from "../policy/scheduler";
import {
  createEffectScheduler,
  resolveEffectSchedulerMode,
} from "../policy/scheduler";

type BatchFn = <T>(fn: () => T) => T;
type EventFn = <T>() => EventSource<T>;

let activeBatch: BatchFn = (fn) => fn();
let activeEvent: EventFn = (() => {}) as EventFn;
let activeFlush: () => void = () => {};

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
  readonly ctx: ExecutionContext;
}

export function createRuntime(options?: RuntimeOptions): Runtime {
  const executionContext = createExecutionContext(options?.hooks);
  const scheduler = createEffectScheduler(
    resolveEffectSchedulerMode(options?.effectStrategy),
    executionContext,
  );
  const dispatcher = new EventDispatcher(scheduler.batch);

  executionContext.setRuntimeHooks(
    scheduler.enqueue,
    scheduler.runtimeNotifySettled,
  );

  executionContext.resetState();
  setDefaultContext(executionContext);

  activeBatch = scheduler.batch.bind(scheduler);
  activeEvent = function <T>() {
    const source = createSource();

    return {
      subscribe(fn: (value: T) => void) {
        return subscribeEvent(source, fn);
      },
      emit(value: T) {
        dispatcher.emit(source, value);
      },
    };
  }.bind(dispatcher);
  activeFlush = scheduler.flush.bind(scheduler);

  return {
    ctx: executionContext,
    batch: activeBatch,
    event: activeEvent,
    flush: activeFlush,
  };
}

/**
 * Exported function alias that always resolves the current runtime batch.
 * @param fn
 * @returns
 */
export const batch: BatchFn = <T>(fn: () => T) => activeBatch(fn);
/**
 * Exported function alias that always resolves the current runtime event.
 */
export const event: EventFn = <T>() => activeEvent<T>();
/**
 * Exported function alias that always resolves the current runtime flush.
 */
export const flush = () => activeFlush();
