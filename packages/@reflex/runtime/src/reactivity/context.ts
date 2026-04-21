import { recordDebugEvent } from "../debug/debug.impl";
import type { ReactiveEdge, ReactiveNode } from "./shape";
import { reuseIncomingEdgeFromSuffixOrCreate } from "./shape/methods/connect";

export interface EngineHooks {
  onSinkInvalidated?(node: ReactiveNode): void;
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

type OnSinkInvalidatedHook = EngineHooks["onSinkInvalidated"];
type OnReactiveSettledHook = EngineHooks["onReactiveSettled"];

export interface ContextSnapshot {
  activeConsumer: ReactiveNode | null;
  trackingVersion: number;
  propagationDepth: number;
  cleanupRegistrar: CleanupRegistrar | null;
  hasThrownError: boolean;
  firstThrownError: unknown;
  trackReadFallback: TrackReadFallback;
  runtimeOnSinkInvalidated: OnSinkInvalidatedHook;
  runtimeOnReactiveSettled: OnReactiveSettledHook;
  globalOnSinkInvalidated: OnSinkInvalidatedHook;
  globalOnReactiveSettled: OnReactiveSettledHook;
}

export interface RuntimeDebugContext {
  readonly scope: "runtime";
}

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;
const DEFAULT_TRACK_READ_FALLBACK: TrackReadFallback =
  reuseIncomingEdgeFromSuffixOrCreate;

export const defaultContext: RuntimeDebugContext = {
  scope: "runtime",
};

export let activeConsumer: ReactiveNode | null = null;
export let trackingVersion = 0;
export let propagationDepth = 0;
export let cleanupRegistrar: CleanupRegistrar | null = null;
export let hasThrownError = false;
export let firstThrownError: unknown = null;
export let trackReadFallback: TrackReadFallback = DEFAULT_TRACK_READ_FALLBACK;
export let onSinkInvalidated: OnSinkInvalidatedHook = undefined;
export let onReactiveSettled: OnReactiveSettledHook = undefined;

let runtimeOnSinkInvalidated: OnSinkInvalidatedHook = undefined;
let runtimeOnReactiveSettled: OnReactiveSettledHook = undefined;
let globalOnSinkInvalidated: OnSinkInvalidatedHook = undefined;
let globalOnReactiveSettled: OnReactiveSettledHook = undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction<TArgs extends unknown[] = any> =
  | ((...args: TArgs) => void)
  | undefined;

function composeHooks<TArgs extends unknown[]>(
  a: ((...args: TArgs) => void) | undefined,
  b: ((...args: TArgs) => void) | undefined,
): ((...args: TArgs) => void) | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;

  return (...args) => {
    a(...args);
    b(...args);
  };
}

function normalizeHook<T extends AnyFunction>(value: unknown): T | undefined {
  return typeof value === "function" ? (value as T) : undefined;
}

function refreshDispatchers(): void {
  onSinkInvalidated = composeHooks<[ReactiveNode]>(
    runtimeOnSinkInvalidated,
    globalOnSinkInvalidated,
  );
  onReactiveSettled = composeHooks(
    runtimeOnReactiveSettled,
    globalOnReactiveSettled,
  );
}

export function getActiveConsumer(): ReactiveNode | null {
  return activeConsumer;
}

export function setActiveConsumer(node: ReactiveNode | null): void {
  activeConsumer = node;
}

export function getPropagationDepth(): number {
  return propagationDepth;
}

export function setPropagationDepth(depth: number): void {
  propagationDepth = depth;
}

export function setTrackingVersion(version: number): void {
  trackingVersion = version;
}

// @__INLINE__
export function advanceTrackingVersion(): number {
  const nextVersion = (trackingVersion + 1) >>> 0;
  trackingVersion = nextVersion === 0 ? 1 : nextVersion;
  return trackingVersion;
}

export function getSinkInvalidatedHook(): OnSinkInvalidatedHook {
  return globalOnSinkInvalidated;
}

export function setSinkInvalidatedHook(
  hook: OnSinkInvalidatedHook = undefined,
): void {
  globalOnSinkInvalidated = normalizeHook<OnSinkInvalidatedHook>(hook);
  refreshDispatchers();
}

export function getReactiveSettledHook(): OnReactiveSettledHook {
  return globalOnReactiveSettled;
}

export function setReactiveSettledHook(
  hook: OnReactiveSettledHook = undefined,
): void {
  globalOnReactiveSettled = normalizeHook<OnReactiveSettledHook>(hook);
  refreshDispatchers();
}

export const dispatchSinkInvalidated = notifySinkInvalidated;

// @__INLINE__
export function enterPropagation(): void {
  ++propagationDepth;
}

// @__INLINE__
export function leavePropagation(): void {
  if (propagationDepth > 0) --propagationDepth;
  if (propagationDepth === 0 && activeConsumer === null) {
    onReactiveSettled?.();
  }
}

export function notifySinkInvalidated(node: ReactiveNode): void {
  if (IS_DEV) recordDebugEvent(defaultContext, "watcher:invalidated", { node });
  onSinkInvalidated?.(node);
}

export function notifySettledIfIdle(): void {
  if (propagationDepth !== 0 || activeConsumer !== null) return;
  if (IS_DEV) recordDebugEvent(defaultContext, "context:settled");
  onReactiveSettled?.();
}

export function clearThrownError(): void {
  hasThrownError = false;
  firstThrownError = null;
}

export function captureThrownError(error: unknown): void {
  if (hasThrownError) return;
  hasThrownError = true;
  firstThrownError = error;
}

export function rethrowCapturedError(): void {
  if (!hasThrownError) return;
  const error = firstThrownError;
  clearThrownError();
  throw error;
}

export function registerWatcherCleanup(cleanup: () => void): void {
  cleanupRegistrar?.(cleanup);
}

export function withCleanupRegistrar<T>(
  registrar: CleanupRegistrar | null,
  fn: () => T,
): T {
  if (cleanupRegistrar === registrar) return fn();
  const prev = cleanupRegistrar;
  cleanupRegistrar = registrar;

  try {
    return fn();
  } finally {
    cleanupRegistrar = prev;
  }
}

export function setHooks(hooks: EngineHooks = {}): void {
  globalOnSinkInvalidated = Object.hasOwn(hooks, "onSinkInvalidated")
    ? normalizeHook(hooks.onSinkInvalidated)
    : undefined;
  globalOnReactiveSettled = Object.hasOwn(hooks, "onReactiveSettled")
    ? normalizeHook(hooks.onReactiveSettled)
    : undefined;
  refreshDispatchers();
}

export function setRuntimeHooks(
  onInvalidated: OnSinkInvalidatedHook = undefined,
  onSettled: OnReactiveSettledHook = undefined,
): void {
  runtimeOnSinkInvalidated = normalizeHook<OnSinkInvalidatedHook>(onInvalidated);
  runtimeOnReactiveSettled = normalizeHook<OnReactiveSettledHook>(onSettled);
  refreshDispatchers();
}

export function setOptions(options: ExecutionContextOptions = {}): void {
  if (!Object.hasOwn(options, "trackReadFallback")) return;
  trackReadFallback =
    normalizeHook<TrackReadFallback>(options.trackReadFallback) ??
    DEFAULT_TRACK_READ_FALLBACK;
}

export function saveContext(): ContextSnapshot {
  return {
    activeConsumer,
    trackingVersion,
    propagationDepth,
    cleanupRegistrar,
    hasThrownError,
    firstThrownError,
    trackReadFallback,
    runtimeOnSinkInvalidated,
    runtimeOnReactiveSettled,
    globalOnSinkInvalidated,
    globalOnReactiveSettled,
  };
}

export function restoreContext(snapshot: ContextSnapshot): void {
  activeConsumer = snapshot.activeConsumer;
  trackingVersion = snapshot.trackingVersion;
  propagationDepth = snapshot.propagationDepth;
  cleanupRegistrar = snapshot.cleanupRegistrar;
  hasThrownError = snapshot.hasThrownError;
  firstThrownError = snapshot.firstThrownError;
  trackReadFallback = snapshot.trackReadFallback;
  runtimeOnSinkInvalidated = snapshot.runtimeOnSinkInvalidated;
  runtimeOnReactiveSettled = snapshot.runtimeOnReactiveSettled;
  globalOnSinkInvalidated = snapshot.globalOnSinkInvalidated;
  globalOnReactiveSettled = snapshot.globalOnReactiveSettled;
  refreshDispatchers();
}

export function resetState(): void {
  activeConsumer = null;
  trackingVersion = 0;
  propagationDepth = 0;
  cleanupRegistrar = null;
  clearThrownError();
}

refreshDispatchers();
