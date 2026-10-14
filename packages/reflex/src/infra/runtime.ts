import {
  switchRuntimeContext,
  untracked,
} from "@volynets/reflex-runtime/internal";
import type {
  ExecutionDomain,
  RuntimeContext as RuntimeExecutionContext,
  RuntimeHostHooks,
} from "@volynets/reflex-runtime/internal";
import { subscribeEvent } from "./event";
import { createSource } from "./factory";
import { createEventDispatcher } from "../policy";
import { createSchedulerDomain } from "@volynets/reflex-scheduler";
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
  /** The isolated execution domain backing this runtime. */
  readonly domain: ExecutionDomain;
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

  // One scheduler per domain (S1): hooks, queue and flush all belong to it.
  const { domain, scheduler } = createSchedulerDomain({
    hooks,
    effectStrategy,
  });
  const execution = domain.context;
  const ctx: RuntimeContext = { scope: "runtime", execution };
  const dispatcher = createEventDispatcher(domain.batch);

  switchRuntimeContext(execution);
  batch = domain.batch;
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
  activeFlush = domain.flush;
  activeHasPending = scheduler.hasPending;

  return {
    ctx,
    domain,
    batch: domain.batch,
    event: activeEvent,
    flush: domain.flush,
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
