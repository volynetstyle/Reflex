import type { ReactiveEdge, ReactiveNode } from "./shape";
import { reuseIncomingEdgeFromSuffixOrCreate } from "./shape/methods/connect";
import { recordDebugEvent } from "../debug.runtime";

export interface EngineHooks {
  onEffectInvalidated?(node: ReactiveNode): void;
  onReactiveSettled?(): void;
}

export type CleanupRegistrar = (cleanup: () => void) => void;
export type TrackReadFallback = (
  source: ReactiveNode,
  consumer: ReactiveNode,
  prev: ReactiveEdge | null,
  nextExpected: ReactiveEdge | null,
  version: number,
) => ReactiveEdge;

export interface ExecutionContextOptions {
  trackReadFallback?: TrackReadFallback;
}

type OnEffectInvalidatedHook = EngineHooks["onEffectInvalidated"];
type OnReactiveSettledHook = EngineHooks["onReactiveSettled"];
type MutableContextFields = {
  cleanupRegistrar: CleanupRegistrar | null;
  trackReadFallback: TrackReadFallback;
  runtimeOnEffectInvalidated: OnEffectInvalidatedHook;
  runtimeOnReactiveSettled: OnReactiveSettledHook;
  effectInvalidatedDispatch: OnEffectInvalidatedHook;
  settledDispatch: OnReactiveSettledHook;
};

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;
export let activeComputed: ReactiveNode | null = null;
export const getActiveComputed = () => activeComputed;
// @__INLINE___
export const setActiveComputed = (c: ReactiveNode | null) =>
  void (activeComputed = c);
export let trackingVersion = 0;
// @__INLINE___
export const setTrackingVersion = (v: number) => void (trackingVersion = v);
export let propagationDepth = 0;
export const getPropagationDepth = () => propagationDepth;
// @__INLINE___
export const setPropagationDepth = (v: number) => void (propagationDepth = v);
export let dispatchEffectInvalidated = undefined as OnEffectInvalidatedHook;
export let trackReadFallback: TrackReadFallback =
  reuseIncomingEdgeFromSuffixOrCreate;
export let dispatchReactiveSettled: OnReactiveSettledHook =
  undefined as OnReactiveSettledHook;
let onEffectInvalidatedHook = undefined as OnEffectInvalidatedHook;
let onReactiveSettledHook = undefined as OnReactiveSettledHook;
export let defaultContext!: ExecutionContext;

// @__INLINE___
export function enterPropagation(): void {
  ++propagationDepth;
}
// @__INLINE___
export function leavePropagation(): void {
  if (propagationDepth > 0) --propagationDepth;
  if (
    propagationDepth === 0 &&
    activeComputed === null &&
    dispatchReactiveSettled
  ) {
    dispatchReactiveSettled();
  }
}
function composeEffectInvalidated(
  runtimeHook: OnEffectInvalidatedHook,
  userHook: OnEffectInvalidatedHook,
): OnEffectInvalidatedHook {
  if (runtimeHook === undefined) return userHook;
  if (userHook === undefined) return runtimeHook;

  return function dispatch(node: ReactiveNode): void {
    runtimeHook(node);
    userHook(node);
  };
}

function composeSettled(
  runtimeHook: OnReactiveSettledHook,
  userHook: OnReactiveSettledHook,
): OnReactiveSettledHook {
  if (runtimeHook === undefined) return userHook;
  if (userHook === undefined) return runtimeHook;

  return function dispatch(): void {
    runtimeHook();
    userHook();
  };
}

export interface ExecutionContext extends MutableContextFields {
  dispatchWatcherEvent(node: ReactiveNode): void;
  maybeNotifySettled(): void;
  enterPropagation(): void;
  leavePropagation(): void;
  resetState(): void;
  setOptions(options?: ExecutionContextOptions): void;
  setHooks(hooks?: EngineHooks): void;
  setRuntimeHooks(
    onEffectInvalidated?: OnEffectInvalidatedHook,
    onReactiveSettled?: OnReactiveSettledHook,
  ): void;
  registerWatcherCleanup(cleanup: () => void): void;
  withCleanupRegistrar<T>(registrar: CleanupRegistrar | null, fn: () => T): T;
}

function normalizeHook<T extends Function | undefined>(
  value: unknown,
): T | undefined {
  return typeof value === "function" ? (value as T) : undefined;
}

function normalizeOwnHook<
  TKey extends keyof EngineHooks,
  TValue extends EngineHooks[TKey],
>(hooks: EngineHooks, key: TKey): TValue | undefined {
  return Object.hasOwn(hooks, key)
    ? normalizeHook<TValue>(hooks[key])
    : undefined;
}

function normalizeTrackReadFallback(
  options: ExecutionContextOptions,
): TrackReadFallback {
  return Object.hasOwn(options, "trackReadFallback")
    ? (normalizeHook<TrackReadFallback>(options.trackReadFallback) ??
        reuseIncomingEdgeFromSuffixOrCreate)
    : reuseIncomingEdgeFromSuffixOrCreate;
}

export function getEffectInvalidatedHook(): OnEffectInvalidatedHook {
  return onEffectInvalidatedHook;
}

export function setEffectInvalidatedHook(
  hook: OnEffectInvalidatedHook,
): OnEffectInvalidatedHook {
  onEffectInvalidatedHook = normalizeHook<OnEffectInvalidatedHook>(hook);
  return onEffectInvalidatedHook;
}

export function getReactiveSettledHook(): OnReactiveSettledHook {
  return onReactiveSettledHook;
}

export function setReactiveSettledHook(
  hook: OnReactiveSettledHook,
): OnReactiveSettledHook {
  onReactiveSettledHook = normalizeHook<OnReactiveSettledHook>(hook);
  return onReactiveSettledHook;
}

function refreshDispatchers(context: ExecutionContext): void {
  context.effectInvalidatedDispatch = composeEffectInvalidated(
    context.runtimeOnEffectInvalidated,
    onEffectInvalidatedHook,
  );

  context.settledDispatch = composeSettled(
    context.runtimeOnReactiveSettled,
    onReactiveSettledHook,
  );

  if (defaultContext === context) {
    dispatchEffectInvalidated = context.effectInvalidatedDispatch;
    dispatchReactiveSettled = context.settledDispatch;
  }

  if (IS_DEV) {
    recordDebugEvent(context, "context:hooks", {
      detail: {
        hasOnEffectInvalidated: context.effectInvalidatedDispatch !== undefined,
        hasOnReactiveSettled: context.settledDispatch !== undefined,
      },
    });
  }
}

function refreshHookRouting(context: ExecutionContext): void {
  refreshDispatchers(context);
  if (defaultContext !== context) {
    refreshDispatchers(defaultContext);
  }
}

function createExecutionContextShape(): ExecutionContext {
  const context = {
    cleanupRegistrar: null,
    trackReadFallback: reuseIncomingEdgeFromSuffixOrCreate,
    runtimeOnEffectInvalidated: undefined,
    runtimeOnReactiveSettled: undefined,
    effectInvalidatedDispatch: undefined,
    settledDispatch: undefined,

    dispatchWatcherEvent(node: ReactiveNode): void {
      if (IS_DEV) recordDebugEvent(context, "watcher:invalidated", { node });
      composeEffectInvalidated(
        context.runtimeOnEffectInvalidated,
        onEffectInvalidatedHook,
      )?.(node);
    },

    maybeNotifySettled(): void {
      if (propagationDepth !== 0 || activeComputed !== null) return;
      if (IS_DEV) recordDebugEvent(context, "context:settled");
      composeSettled(
        context.runtimeOnReactiveSettled,
        onReactiveSettledHook,
      )?.();
    },

    resetState(): void {
      activeComputed = null;
      trackingVersion = 0;
      propagationDepth = 0;
      context.cleanupRegistrar = null;
    },

    setOptions(options: ExecutionContextOptions = {}): void {
      context.trackReadFallback = normalizeTrackReadFallback(options);

      if (defaultContext === context) {
        trackReadFallback = context.trackReadFallback;
      }
    },

    setHooks(hooks: EngineHooks = {}): void {
      setEffectInvalidatedHook(normalizeOwnHook(hooks, "onEffectInvalidated"));
      setReactiveSettledHook(normalizeOwnHook(hooks, "onReactiveSettled"));
      refreshHookRouting(context);
    },

    setRuntimeHooks(
      onEffectInvalidated: OnEffectInvalidatedHook = undefined,
      onReactiveSettled: OnReactiveSettledHook = undefined,
    ): void {
      context.runtimeOnEffectInvalidated =
        normalizeHook<OnEffectInvalidatedHook>(onEffectInvalidated);
      context.runtimeOnReactiveSettled =
        normalizeHook<OnReactiveSettledHook>(onReactiveSettled);
      refreshDispatchers(context);
    },

    registerWatcherCleanup(cleanup: () => void): void {
      context.cleanupRegistrar?.(cleanup);
    },

    withCleanupRegistrar<T>(
      registrar: CleanupRegistrar | null,
      fn: () => T,
    ): T {
      if (context.cleanupRegistrar === registrar) return fn();

      const prev = context.cleanupRegistrar;
      context.cleanupRegistrar = registrar;
      try {
        return fn();
      } finally {
        context.cleanupRegistrar = prev;
      }
    },
  } as ExecutionContext;

  return context;
}

defaultContext = createExecutionContextShape();

function installExecutionContext(context: ExecutionContext): void {
  trackReadFallback = context.trackReadFallback;
  dispatchEffectInvalidated = context.effectInvalidatedDispatch;
  dispatchReactiveSettled = context.settledDispatch;
}

installExecutionContext(defaultContext);

export function createExecutionContext(
  hooks: EngineHooks = {},
  options: ExecutionContextOptions = {},
): ExecutionContext {
  const context = createExecutionContextShape();
  context.setHooks(hooks);
  context.setOptions(options);
  return context;
}

export function getDefaultContext(): ExecutionContext {
  return defaultContext;
}

export function setDefaultContext(context: ExecutionContext): ExecutionContext {
  const previous = defaultContext;
  defaultContext = context;
  refreshDispatchers(context);
  installExecutionContext(context);
  return previous;
}

export function resetDefaultContext(
  hooks: EngineHooks = {},
  options: ExecutionContextOptions = {},
): ExecutionContext {
  defaultContext = createExecutionContext(hooks, options);
  installExecutionContext(defaultContext);
  return defaultContext;
}
