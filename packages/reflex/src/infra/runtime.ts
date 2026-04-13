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

let activeBatch: BatchFn = (fn) => fn();

export interface RuntimeOptions {
  hooks?: EngineHooks;
  effectStrategy?: EffectStrategy;
}

function createRuntimeInfrastructure(options?: RuntimeOptions) {
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

  return {
    scheduler,
    dispatcher,
    executionContext,
  };
}

export function batch<T>(fn: () => T): T {
  return activeBatch(fn);
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
  const { scheduler, dispatcher, executionContext } =
    createRuntimeInfrastructure(options);

  activeBatch = scheduler.batch;

  return {
    ctx: executionContext,
    batch: scheduler.batch,

    event<T>() {
      const source = createSource();

      return {
        subscribe(fn: (value: T) => void) {
          return subscribeEvent(source, fn);
        },
        emit(value: T) {
          dispatcher.emit(source, value);
        },
      };
    },
    flush: scheduler.flush,
  };
}
