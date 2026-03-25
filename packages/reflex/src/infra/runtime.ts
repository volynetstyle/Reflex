import {
  runtime,
  subscribeEvent,
} from "@reflex/runtime";
import {
  resolveEffectSchedulerMode,
  EffectScheduler,
  EventDispatcher,
  EffectStrategy,
} from "../policy";
import { createSource } from "./factory";
import type {
  EngineContext,
  EngineHooks,
  ReactiveNode,
} from "../runtime-types";

interface RuntimeOptions {
  hooks?: EngineHooks;
  effectStrategy?: EffectStrategy;
}

function createRuntimeInfrastructure(options?: RuntimeOptions) {
  const hooks = options?.hooks;
  const scheduler = new EffectScheduler(
    resolveEffectSchedulerMode(options?.effectStrategy),
  );
  const dispatcher = new EventDispatcher((fn) => scheduler.batch(fn));

  return {
    scheduler,
    dispatcher,
    runtimeHooks: {
      ...hooks,
      onEffectInvalidated(node: ReactiveNode) {
        scheduler.enqueue(node);
        hooks?.onEffectInvalidated?.(node);
      },
    },
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
  readonly ctx: EngineContext;
}

export function createRuntime(options?: RuntimeOptions): Runtime {
  const { scheduler, dispatcher, runtimeHooks } =
    createRuntimeInfrastructure(options);

  runtime.resetState();
  runtime.setHooks(runtimeHooks);

  return {
    get ctx() {
      return runtime;
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
