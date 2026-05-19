import { recordDebugEvent } from "../debug/debug.runtime";
import type { ReactiveEdge, ReactiveNode } from "./shape";
import { reuseIncomingEdgeFromSuffixOrCreate } from "./shape/graph";

export interface EngineHooks {
  onSinkInvalidated?(node: ReactiveNode): void;
  onReactiveSettled?(): void;
}

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

export interface ExecutionState {
  activeConsumer: ReactiveNode | null;
  trackingVersion: number;
  propagationDepth: number;
  trackReadFallback: TrackReadFallback;
  runtimeOnSinkInvalidated: OnSinkInvalidatedHook;
  runtimeOnReactiveSettled: OnReactiveSettledHook;
  globalOnSinkInvalidated: OnSinkInvalidatedHook;
  globalOnReactiveSettled: OnReactiveSettledHook;
  onSinkInvalidated: OnSinkInvalidatedHook;
  onReactiveSettled: OnReactiveSettledHook;
}

export interface ContextSnapshot {
  activeConsumer: ReactiveNode | null;
  trackingVersion: number;
  propagationDepth: number;
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
export let trackReadFallback: TrackReadFallback = DEFAULT_TRACK_READ_FALLBACK;
export let onSinkInvalidated: OnSinkInvalidatedHook = undefined;
export let onReactiveSettled: OnReactiveSettledHook = undefined;

let runtimeOnSinkInvalidated: OnSinkInvalidatedHook = undefined;
let runtimeOnReactiveSettled: OnReactiveSettledHook = undefined;
let globalOnSinkInvalidated: OnSinkInvalidatedHook = undefined;
let globalOnReactiveSettled: OnReactiveSettledHook = undefined;
let currentExecutionState: ExecutionState;

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

function refreshStateDispatchers(state: ExecutionState): void {
  state.onSinkInvalidated = composeHooks<[ReactiveNode]>(
    state.runtimeOnSinkInvalidated,
    state.globalOnSinkInvalidated,
  );
  state.onReactiveSettled = composeHooks(
    state.runtimeOnReactiveSettled,
    state.globalOnReactiveSettled,
  );
}

function refreshActiveDispatchers(): void {
  onSinkInvalidated = composeHooks<[ReactiveNode]>(
    runtimeOnSinkInvalidated,
    globalOnSinkInvalidated,
  );
  onReactiveSettled = composeHooks(
    runtimeOnReactiveSettled,
    globalOnReactiveSettled,
  );
  currentExecutionState.onSinkInvalidated = onSinkInvalidated;
  currentExecutionState.onReactiveSettled = onReactiveSettled;
}

export function createExecutionState(
  options: ExecutionContextOptions = {},
): ExecutionState {
  const state: ExecutionState = {
    activeConsumer: null,
    trackingVersion: 0,
    propagationDepth: 0,
    trackReadFallback:
      normalizeHook<TrackReadFallback>(options.trackReadFallback) ??
      DEFAULT_TRACK_READ_FALLBACK,
    runtimeOnSinkInvalidated: undefined,
    runtimeOnReactiveSettled: undefined,
    globalOnSinkInvalidated: undefined,
    globalOnReactiveSettled: undefined,
    onSinkInvalidated: undefined,
    onReactiveSettled: undefined,
  };

  refreshStateDispatchers(state);
  return state;
}

export const defaultExecutionState = createExecutionState();
currentExecutionState = defaultExecutionState;

function loadExecutionState(state: ExecutionState): void {
  currentExecutionState = state;

  activeConsumer = state.activeConsumer;
  trackingVersion = state.trackingVersion;
  propagationDepth = state.propagationDepth;
  trackReadFallback = state.trackReadFallback;
  runtimeOnSinkInvalidated = state.runtimeOnSinkInvalidated;
  runtimeOnReactiveSettled = state.runtimeOnReactiveSettled;
  globalOnSinkInvalidated = state.globalOnSinkInvalidated;
  globalOnReactiveSettled = state.globalOnReactiveSettled;
  onSinkInvalidated = state.onSinkInvalidated;
  onReactiveSettled = state.onReactiveSettled;
}

function storeExecutionState(
  state: ExecutionState = currentExecutionState,
): void {
  state.activeConsumer = activeConsumer;
  if (trackingVersion > state.trackingVersion) {
    state.trackingVersion = trackingVersion;
  }
  state.propagationDepth = propagationDepth;
  state.trackReadFallback = trackReadFallback;
  state.runtimeOnSinkInvalidated = runtimeOnSinkInvalidated;
  state.runtimeOnReactiveSettled = runtimeOnReactiveSettled;
  state.globalOnSinkInvalidated = globalOnSinkInvalidated;
  state.globalOnReactiveSettled = globalOnReactiveSettled;
  state.onSinkInvalidated = onSinkInvalidated;
  state.onReactiveSettled = onReactiveSettled;
}

export function getActiveExecutionState(): ExecutionState {
  return currentExecutionState;
}

export function setActiveExecutionState(state: ExecutionState): void {
  if (state === currentExecutionState) return;
  storeExecutionState();
  loadExecutionState(state);
}

export function runWithExecutionState<T>(
  state: ExecutionState,
  fn: () => T,
): T {
  const prevState = currentExecutionState;

  if (prevState === state) {
    return fn();
  }

  storeExecutionState(prevState);
  loadExecutionState(state);

  try {
    return fn();
  } finally {
    storeExecutionState(state);
    loadExecutionState(prevState);
  }
}

// @__INLINE__
export function getActiveConsumer(): ReactiveNode | null {
  return activeConsumer;
}

// @__INLINE__
export function setActiveConsumer(node: ReactiveNode | null): void {
  activeConsumer = node;
}

// @__INLINE__
export function getPropagationDepth(): number {
  return propagationDepth;
}

// @__INLINE__
export function setPropagationDepth(depth: number): void {
  propagationDepth = depth;
}

// @__INLINE__
export function setTrackingVersion(version: number): void {
  if (version > trackingVersion) trackingVersion = version;
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
  currentExecutionState.globalOnSinkInvalidated = globalOnSinkInvalidated;
  refreshActiveDispatchers();
}

export function getReactiveSettledHook(): OnReactiveSettledHook {
  return globalOnReactiveSettled;
}

export function setReactiveSettledHook(
  hook: OnReactiveSettledHook = undefined,
): void {
  globalOnReactiveSettled = normalizeHook<OnReactiveSettledHook>(hook);
  currentExecutionState.globalOnReactiveSettled = globalOnReactiveSettled;
  refreshActiveDispatchers();
}

// @__INLINE__
export const dispatchSinkInvalidated = notifySinkInvalidated;

// @__INLINE__
export function enterPropagation(): void {
  ++propagationDepth;
}

// @__INLINE__
export function leavePropagation(): void {
  if (propagationDepth > 0) --propagationDepth;
  if (!propagationDepth && activeConsumer === null) onReactiveSettled?.();
}

// @__INLINE__
export function notifySinkInvalidated(node: ReactiveNode): void {
  if (IS_DEV) recordDebugEvent(defaultContext, "watcher:invalidated", { node });
  onSinkInvalidated?.(node);
}

// @__INLINE__
export function notifySettledIfIdle(): void {
  if (propagationDepth !== 0 || activeConsumer !== null) return;
  if (IS_DEV) recordDebugEvent(defaultContext, "context:settled");
  onReactiveSettled?.();
}

function isExecutionState(value: unknown): value is ExecutionState {
  return (
    typeof value === "object" &&
    value !== null &&
    "trackReadFallback" in value &&
    "runtimeOnSinkInvalidated" in value &&
    "globalOnSinkInvalidated" in value
  );
}

function setHooksForState(state: ExecutionState, hooks: EngineHooks = {}): void {
  state.globalOnSinkInvalidated = Object.hasOwn(hooks, "onSinkInvalidated")
    ? normalizeHook(hooks.onSinkInvalidated)
    : undefined;
  state.globalOnReactiveSettled = Object.hasOwn(hooks, "onReactiveSettled")
    ? normalizeHook(hooks.onReactiveSettled)
    : undefined;
  refreshStateDispatchers(state);
}

function setRuntimeHooksForState(
  state: ExecutionState,
  onInvalidated: OnSinkInvalidatedHook = undefined,
  onSettled: OnReactiveSettledHook = undefined,
): void {
  state.runtimeOnSinkInvalidated =
    normalizeHook<OnSinkInvalidatedHook>(onInvalidated);
  state.runtimeOnReactiveSettled =
    normalizeHook<OnReactiveSettledHook>(onSettled);
  refreshStateDispatchers(state);
}

function setOptionsForState(
  state: ExecutionState,
  options: ExecutionContextOptions = {},
): void {
  if (!Object.hasOwn(options, "trackReadFallback")) return;
  state.trackReadFallback =
    normalizeHook<TrackReadFallback>(options.trackReadFallback) ??
    DEFAULT_TRACK_READ_FALLBACK;
}

function reloadActiveStateIfCurrent(state: ExecutionState): void {
  if (state === currentExecutionState) {
    loadExecutionState(state);
  }
}

export function setHooks(state: ExecutionState, hooks?: EngineHooks): void;
export function setHooks(hooks?: EngineHooks): void;
export function setHooks(
  stateOrHooks: ExecutionState | EngineHooks = {},
  maybeHooks: EngineHooks = {},
): void {
  if (isExecutionState(stateOrHooks)) {
    setHooksForState(stateOrHooks, maybeHooks);
    reloadActiveStateIfCurrent(stateOrHooks);
    return;
  }

  const state = currentExecutionState;
  const hooks = stateOrHooks;
  setHooksForState(state, hooks);
  reloadActiveStateIfCurrent(state);
}

export function setRuntimeHooks(
  state: ExecutionState,
  onInvalidated?: OnSinkInvalidatedHook,
  onSettled?: OnReactiveSettledHook,
): void;
export function setRuntimeHooks(
  onInvalidated?: OnSinkInvalidatedHook,
  onSettled?: OnReactiveSettledHook,
): void;
export function setRuntimeHooks(
  stateOrOnInvalidated: ExecutionState | OnSinkInvalidatedHook = undefined,
  onInvalidatedOrSettled: OnSinkInvalidatedHook | OnReactiveSettledHook =
    undefined,
  maybeSettled: OnReactiveSettledHook = undefined,
): void {
  if (isExecutionState(stateOrOnInvalidated)) {
    setRuntimeHooksForState(
      stateOrOnInvalidated,
      onInvalidatedOrSettled as OnSinkInvalidatedHook,
      maybeSettled,
    );
    reloadActiveStateIfCurrent(stateOrOnInvalidated);
    return;
  }

  const state = currentExecutionState;
  setRuntimeHooksForState(
    state,
    stateOrOnInvalidated,
    onInvalidatedOrSettled as OnReactiveSettledHook,
  );
  reloadActiveStateIfCurrent(state);
}

export function setOptions(
  state: ExecutionState,
  options?: ExecutionContextOptions,
): void;
export function setOptions(options?: ExecutionContextOptions): void;
export function setOptions(
  stateOrOptions: ExecutionState | ExecutionContextOptions = {},
  maybeOptions: ExecutionContextOptions = {},
): void {
  if (isExecutionState(stateOrOptions)) {
    setOptionsForState(stateOrOptions, maybeOptions);
    reloadActiveStateIfCurrent(stateOrOptions);
    return;
  }

  const state = currentExecutionState;
  setOptionsForState(state, stateOrOptions);
  reloadActiveStateIfCurrent(state);
}

export function saveExecutionState(state: ExecutionState): ContextSnapshot {
  return {
    activeConsumer: state.activeConsumer,
    trackingVersion: state.trackingVersion,
    propagationDepth: state.propagationDepth,
    trackReadFallback: state.trackReadFallback,
    runtimeOnSinkInvalidated: state.runtimeOnSinkInvalidated,
    runtimeOnReactiveSettled: state.runtimeOnReactiveSettled,
    globalOnSinkInvalidated: state.globalOnSinkInvalidated,
    globalOnReactiveSettled: state.globalOnReactiveSettled,
  };
}

export function restoreExecutionState(
  state: ExecutionState,
  snapshot: ContextSnapshot,
): void {
  const currentVersion =
    state === currentExecutionState ? trackingVersion : state.trackingVersion;

  state.activeConsumer = snapshot.activeConsumer;
  state.trackingVersion =
    snapshot.trackingVersion > currentVersion
      ? snapshot.trackingVersion
      : currentVersion;
  state.propagationDepth = snapshot.propagationDepth;
  state.trackReadFallback = snapshot.trackReadFallback;
  state.runtimeOnSinkInvalidated = snapshot.runtimeOnSinkInvalidated;
  state.runtimeOnReactiveSettled = snapshot.runtimeOnReactiveSettled;
  state.globalOnSinkInvalidated = snapshot.globalOnSinkInvalidated;
  state.globalOnReactiveSettled = snapshot.globalOnReactiveSettled;
  refreshStateDispatchers(state);
  reloadActiveStateIfCurrent(state);
}

export function saveContext(): ContextSnapshot {
  storeExecutionState();
  return saveExecutionState(currentExecutionState);
}

export function restoreContext(snapshot: ContextSnapshot): void {
  restoreExecutionState(currentExecutionState, snapshot);
}

export function resetState(state: ExecutionState = currentExecutionState): void {
  state.activeConsumer = null;
  state.trackingVersion = 0;
  state.propagationDepth = 0;
  reloadActiveStateIfCurrent(state);
}
