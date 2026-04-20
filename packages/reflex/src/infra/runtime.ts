import {
  resetState,
  setHooks,
  setRuntimeHooks,
} from "@reflex/runtime";
import type { EngineHooks } from "@reflex/runtime";
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

export interface RuntimeContext {
  readonly scope: "runtime";
}

let activeBatch: BatchFn = (fn) => fn();
let activeEvent: EventFn = (() => {
  throw new Error("Runtime has not been created");
}) as EventFn;
let activeFlush: () => void = () => {};
let activeContext: RuntimeContext = { scope: "runtime" };

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
  const scheduler = createEffectScheduler(
    resolveEffectSchedulerMode(effectStrategy),
  );
  const dispatcher = new EventDispatcher(scheduler.batch.bind(scheduler));

  if (hooks !== undefined) {
    setHooks(hooks);
  }

  setRuntimeHooks(
    scheduler.enqueue.bind(scheduler),
    scheduler.runtimeNotifySettled,
  );

  resetState();
  activeContext = { scope: "runtime" };
  activeBatch = scheduler.batch.bind(scheduler);
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
  activeFlush = scheduler.flush.bind(scheduler);

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
