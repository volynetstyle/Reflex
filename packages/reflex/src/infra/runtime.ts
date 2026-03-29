import {
  subscribeEvent,
  createExecutionContext,
  setDefaultContext,
} from "@reflex/runtime";
import type {
  ExecutionContext,
  EngineHooks,
  ReactiveNode,
} from "@reflex/runtime";
import type {
  EffectStrategy} from "../policy";
import {
  resolveEffectSchedulerMode,
  EffectScheduler,
  EventDispatcher
} from "../policy";
import { createSource } from "./factory";

interface RuntimeOptions {
  hooks?: EngineHooks;
  effectStrategy?: EffectStrategy;
}

function createRuntimeInfrastructure(options?: RuntimeOptions) {
  const hooks = options?.hooks;
  
  // Create empty context first
  const executionContext = createExecutionContext();

  const scheduler = new EffectScheduler(
    resolveEffectSchedulerMode(options?.effectStrategy),
    executionContext,
  );
  const dispatcher = new EventDispatcher((fn) => scheduler.batch(fn));

  // Set hooks with scheduler integration
  executionContext.setHooks({
    ...hooks,
    onEffectInvalidated(node: ReactiveNode) {
      scheduler.enqueue(node);
      hooks?.onEffectInvalidated?.(node);
    },
    onReactiveSettled() {
      scheduler.notifySettled();
      hooks?.onReactiveSettled?.();
    },
  });

  return {
    scheduler,
    dispatcher,
    executionContext,
  };
}

export interface Event<T> {
  subscribe(fn: (value: T) => void): Destructor;
}

export interface EventSource<T> extends Event<T> {
  emit(value: T): void;
}

export interface Runtime {
  event<T>(): EventSource<T>;
  flush(): void;
  readonly ctx: ExecutionContext;
}

export function createRuntime(options?: RuntimeOptions): Runtime {
  const { scheduler, dispatcher, executionContext } =
    createRuntimeInfrastructure(options);

  executionContext.resetState();
  setDefaultContext(executionContext);

  return {
    get ctx() {
      return executionContext;
    },

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

    flush() {
      scheduler.flush();
    },
  };
}
