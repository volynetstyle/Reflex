import {
  setHooks,
  setRuntimeHooks,
  withCleanupRegistrar,
} from "@reflex/runtime";
import type { EngineHooks, ReactiveNode } from "@reflex/runtime";
import { subscribeEvent } from "./event";
import { createSource } from "./factory";
import {
  getCurrentRuntimeBinding,
  getDefaultRuntimeBinding,
  getRuntimeBindings,
  getWatcherRuntime,
  registerRuntimeBinding,
  setDefaultRuntimeBinding,
  unregisterRuntimeBinding,
  withRuntimeBinding,
  type RuntimeBinding,
} from "./runtime.binding";
import { EventDispatcher } from "../policy";
import type { EffectStrategy } from "../policy/scheduler";
import {
  createEffectScheduler,
  resolveEffectSchedulerMode,
} from "../policy/scheduler";
import { computed as createComputed, memo as createMemo } from "../api/derived";
import { effect as createEffect } from "../api/effect";
import { signal as createSignal } from "../api/signal";
import type { EffectCleanupRegistrar } from "../api/effect";

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
}

export interface ScopedRuntime extends Runtime {
  signal<T>(initialValue: T): readonly [Signal<T>, Setter<T>];
  computed<T>(fn: () => T): Computed<T>;
  memo<T>(fn: () => T): Memo<T>;
  effect(fn: EffectFn): Destructor;
  withCleanupRegistrar<T>(
    registrar: EffectCleanupRegistrar | null,
    fn: () => T,
  ): T;
  run<T>(fn: () => T): T;
  dispose(): void;
}

type InternalRuntime = ScopedRuntime & RuntimeBinding;

let dispatchersInstalled = false;

function ensureScopedDispatchers(): void {
  if (dispatchersInstalled) return;

  setRuntimeHooks(
    (node: ReactiveNode) => {
      const runtime = getWatcherRuntime(node);
      runtime?.enqueue(node);
    },
    () => {
      for (const runtime of getRuntimeBindings()) {
        runtime.notifySettled();
      }
    },
  );

  dispatchersInstalled = true;
}

function createScopedRuntimeCore({
  hooks,
  effectStrategy,
}: RuntimeOptions = {}): InternalRuntime {
  ensureScopedDispatchers();

  if (hooks !== undefined) {
    setHooks(hooks);
  }

  const scheduler = createEffectScheduler(
    resolveEffectSchedulerMode(effectStrategy),
  );
  let runtime: InternalRuntime;
  let disposed = false;

  const dispatcher = new EventDispatcher((flush) => {
    return runtime.batch(flush);
  });

  runtime = {
    batch<T>(fn: () => T): T {
      if (disposed) return fn();
      return scheduler.batch(() => withRuntimeBinding(runtime, fn));
    },

    event<T>(): EventSource<T> {
      const source = createSource<T>();

      return {
        subscribe(fn: (value: T) => void) {
          return subscribeEvent(source, fn);
        },
        emit(value: T) {
          if (disposed) return;
          dispatcher.emit(source, value);
        },
      };
    },

    flush(): void {
      if (disposed) return;
      scheduler.flush();
    },

    signal<T>(initialValue: T): readonly [Signal<T>, Setter<T>] {
      return withRuntimeBinding(runtime, () => createSignal(initialValue));
    },

    computed<T>(fn: () => T): Computed<T> {
      return withRuntimeBinding(runtime, () =>
        createComputed(() => withRuntimeBinding(runtime, fn)),
      );
    },

    memo<T>(fn: () => T): Memo<T> {
      return withRuntimeBinding(runtime, () =>
        createMemo(() => withRuntimeBinding(runtime, fn)),
      );
    },

    effect(fn: EffectFn): Destructor {
      return withRuntimeBinding(runtime, () => createEffect(fn));
    },

    withCleanupRegistrar<T>(
      registrar: EffectCleanupRegistrar | null,
      fn: () => T,
    ): T {
      return withRuntimeBinding(runtime, () =>
        withCleanupRegistrar(registrar, fn),
      );
    },

    run<T>(fn: () => T): T {
      return withRuntimeBinding(runtime, fn);
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      unregisterRuntimeBinding(runtime);
      scheduler.reset();
      dispatcher.queue.length = 0;
      dispatcher.head = 0;
      dispatcher.flushing = false;
    },

    enqueue(node: ReactiveNode): void {
      if (disposed) return;
      scheduler.enqueue(node);
    },

    notifySettled(): void {
      if (disposed) return;
      scheduler.notifySettled();
    },

    isDisposed(): boolean {
      return disposed;
    },
  };

  registerRuntimeBinding(runtime);
  return runtime;
}

function getActiveRuntime(): ScopedRuntime {
  const current =
    (getCurrentRuntimeBinding() ??
      getDefaultRuntimeBinding()) as ScopedRuntime | null;

  if (current !== null) {
    return current;
  }

  return createRuntime();
}

export function createScopedRuntime(options: RuntimeOptions = {}): ScopedRuntime {
  return createScopedRuntimeCore(options);
}

export function createRuntime(options: RuntimeOptions = {}): ScopedRuntime {
  const runtime = createScopedRuntimeCore(options);
  setDefaultRuntimeBinding(runtime);
  return runtime;
}

export const batch = <T>(fn: () => T): T => getActiveRuntime().batch(fn);

export const event = <T>(): EventSource<T> => getActiveRuntime().event<T>();

export const flush = (): void => {
  getActiveRuntime().flush();
};
