import type { ReactiveEdge, ReactiveNode } from "./shape";
import { reuseIncomingEdgeFromSuffixOrCreate } from "./shape/methods/connect";
import { recordDebugEvent } from "../debug";

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
) => ReactiveEdge;

export interface ExecutionContextOptions {
  trackReadFallback?: TrackReadFallback;
}

type OnEffectInvalidatedHook = EngineHooks["onEffectInvalidated"];
type OnReactiveSettledHook = EngineHooks["onReactiveSettled"];

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

export let dispatchEffectInvalidated = undefined as OnEffectInvalidatedHook;
export let trackReadFallback: TrackReadFallback =
  reuseIncomingEdgeFromSuffixOrCreate;

export class ExecutionContext {
  activeComputed: ReactiveNode | null = null;
  propagationDepth = 0;
  cleanupRegistrar: CleanupRegistrar | null = null;
  trackReadFallback: TrackReadFallback = reuseIncomingEdgeFromSuffixOrCreate;

  onEffectInvalidated: OnEffectInvalidatedHook = undefined;
  onReactiveSettled: OnReactiveSettledHook = undefined;

  runtimeOnEffectInvalidated: OnEffectInvalidatedHook = undefined;
  runtimeOnReactiveSettled: OnReactiveSettledHook = undefined;

  effectInvalidatedDispatch: OnEffectInvalidatedHook = undefined;
  settledDispatch: OnReactiveSettledHook = undefined;

  constructor(hooks: EngineHooks = {}, options: ExecutionContextOptions = {}) {
    this.setHooks(hooks);
    this.setOptions(options);
  }

  dispatchWatcherEvent(node: ReactiveNode): void {
    if (IS_DEV) recordDebugEvent(this, "watcher:invalidated", { node });
    this.effectInvalidatedDispatch?.(node);
  }

  maybeNotifySettled(): void {
    if (this.propagationDepth !== 0 || this.activeComputed !== null) return;
    if (IS_DEV) recordDebugEvent(this, "context:settled");
    this.settledDispatch?.();
  }

  enterPropagation(): void {
    ++this.propagationDepth;
    if (IS_DEV)
      recordDebugEvent(this, "context:enter-propagation", {
        detail: { depth: this.propagationDepth },
      });
  }

  leavePropagation(): void {
    if (this.propagationDepth > 0) --this.propagationDepth;
    if (IS_DEV)
      recordDebugEvent(this, "context:leave-propagation", {
        detail: { depth: this.propagationDepth },
      });
    this.maybeNotifySettled();
  }

  resetState(): void {
    this.activeComputed = null;
    this.propagationDepth = 0;
    this.cleanupRegistrar = null;
  }

  setOptions(options: ExecutionContextOptions = {}): void {
    this.trackReadFallback = trackReadFallback =
      typeof options.trackReadFallback === "function"
        ? options.trackReadFallback
        : reuseIncomingEdgeFromSuffixOrCreate;
  }

  setHooks(hooks: EngineHooks = {}): void {
    this.onEffectInvalidated =
      typeof hooks.onEffectInvalidated === "function"
        ? hooks.onEffectInvalidated
        : undefined;
    this.onReactiveSettled =
      typeof hooks.onReactiveSettled === "function"
        ? hooks.onReactiveSettled
        : undefined;
    this.refreshDispatchers();
  }

  setRuntimeHooks(
    onEffectInvalidated: OnEffectInvalidatedHook = undefined,
    onReactiveSettled: OnReactiveSettledHook = undefined,
  ): void {
    this.runtimeOnEffectInvalidated =
      typeof onEffectInvalidated === "function"
        ? onEffectInvalidated
        : undefined;
    this.runtimeOnReactiveSettled =
      typeof onReactiveSettled === "function" ? onReactiveSettled : undefined;
    this.refreshDispatchers();
  }

  registerWatcherCleanup(cleanup: () => void): void {
    this.cleanupRegistrar?.(cleanup);
  }

  withCleanupRegistrar<T>(registrar: CleanupRegistrar | null, fn: () => T): T {
    const prev = this.cleanupRegistrar;
    this.cleanupRegistrar = registrar;
    try {
      return fn();
    } finally {
      this.cleanupRegistrar = prev;
    }
  }

  private refreshDispatchers(): void {
    const ri = this.runtimeOnEffectInvalidated,
      pi = this.onEffectInvalidated;
    const rs = this.runtimeOnReactiveSettled,
      ps = this.onReactiveSettled;

    this.effectInvalidatedDispatch = dispatchEffectInvalidated =
      ri && pi
        ? function (node) {
            ri(node);
            pi(node);
          }
        : (ri ?? pi);

    this.settledDispatch =
      rs && ps
        ? function () {
            rs();
            ps();
          }
        : (rs ?? ps);

    if (IS_DEV)
      recordDebugEvent(this, "context:hooks", {
        detail: {
          hasOnEffectInvalidated: this.effectInvalidatedDispatch !== undefined,
          hasOnReactiveSettled: this.settledDispatch !== undefined,
        },
      });
  }
}

export let defaultContext = new ExecutionContext();

export function createExecutionContext(
  hooks: EngineHooks = {},
  options: ExecutionContextOptions = {},
): ExecutionContext {
  return new ExecutionContext(hooks, options);
}

export function getDefaultContext(): ExecutionContext {
  return defaultContext;
}

export function setDefaultContext(context: ExecutionContext): ExecutionContext {
  const previous = defaultContext;
  defaultContext = context;
  return previous;
}

export function resetDefaultContext(
  hooks: EngineHooks = {},
  options: ExecutionContextOptions = {},
): ExecutionContext {
  return (defaultContext = new ExecutionContext(hooks, options));
}
