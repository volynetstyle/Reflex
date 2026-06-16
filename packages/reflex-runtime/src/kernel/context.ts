import { recordDebugEvent } from "../debug/debug.runtime";
import { profileRuntimeCounter } from "../profiling";
import type { ReactiveEdge, ReactiveNode } from "./shape";
import { reuseIncomingEdgeFromSuffixOrCreate } from "./shape/graph";

export const RUNTIME_CONTEXT_BRAND: unique symbol = Symbol("RuntimeContext");

export interface RuntimeHooks {
  sinkInvalidatedDispatcher?(node: ReactiveNode): void;
  reactiveSettledDispatcher?(): void;
  effectCleanupRegistrar?(dispose: () => void): void;
}

export type RuntimeHostHooks = RuntimeHooks;

export type ReadTrackingStrategy = (
  source: ReactiveNode,
  consumer: ReactiveNode,
  prev: ReactiveEdge | null,
  nextExpected: ReactiveEdge | null,
  version: number,
) => ReactiveEdge;

export interface RuntimeContextOptions {
  readTrackingStrategy?: ReadTrackingStrategy;
}

export type SinkInvalidatedHook = RuntimeHooks["sinkInvalidatedDispatcher"];
export type ReactiveSettledHook = RuntimeHooks["reactiveSettledDispatcher"];
export type EffectCleanupHook = RuntimeHooks["effectCleanupRegistrar"];

export interface RuntimeContext {
  readonly [RUNTIME_CONTEXT_BRAND]: true;
  currentConsumer: ReactiveNode | null;
  trackingEpoch: number;
  propagationScopeDepth: number;
  batchDepth: number;
  pendingReactiveSettled: boolean;
  readTrackingStrategy: ReadTrackingStrategy;
  sinkInvalidatedHook: SinkInvalidatedHook;
  reactiveSettledHook: ReactiveSettledHook;
  effectCleanupHook: EffectCleanupHook;
}

export type RuntimeContextSnapshot = Omit<
  RuntimeContext,
  typeof RUNTIME_CONTEXT_BRAND
>;

export interface RuntimeDebugContext {
  readonly scope: "runtime";
}

export const DEFAULT_READ_TRACKING_STRATEGY: ReadTrackingStrategy =
  reuseIncomingEdgeFromSuffixOrCreate;

export const defaultContext: RuntimeDebugContext = {
  scope: "runtime",
};

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

export let currentConsumer: ReactiveNode | null = null;
export let trackingEpoch = 0;
export let propagationScopeDepth = 0;

export const reactiveBatchState = {
  batchDepth: 0,
  pendingReactiveSettled: false,
};

export let readTrackingStrategy: ReadTrackingStrategy =
  DEFAULT_READ_TRACKING_STRATEGY;

export let sinkInvalidatedHook: SinkInvalidatedHook = undefined;
export let reactiveSettledHook: ReactiveSettledHook = undefined;
export let effectCleanupHook: EffectCleanupHook = undefined;

function asHook<T>(value: unknown): T | undefined {
  return typeof value === "function" ? (value as T) : undefined;
}

function isRuntimeContext(value: unknown): value is RuntimeContext {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as RuntimeContext)[RUNTIME_CONTEXT_BRAND] === true
  );
}

export function createRuntimeContext(
  options: RuntimeContextOptions = {},
): RuntimeContext {
  return {
    [RUNTIME_CONTEXT_BRAND]: true,
    currentConsumer: null,
    trackingEpoch: 0,
    propagationScopeDepth: 0,
    batchDepth: 0,
    pendingReactiveSettled: false,
    readTrackingStrategy:
      asHook<ReadTrackingStrategy>(options.readTrackingStrategy) ??
      DEFAULT_READ_TRACKING_STRATEGY,
    sinkInvalidatedHook: undefined,
    reactiveSettledHook: undefined,
    effectCleanupHook: undefined,
  };
}

export const defaultRuntimeContext = createRuntimeContext();

let activeRuntimeContext: RuntimeContext = defaultRuntimeContext;

export function activateRuntimeContext(context: RuntimeContext): void {
  activeRuntimeContext = context;

  currentConsumer = context.currentConsumer;
  trackingEpoch = context.trackingEpoch;
  propagationScopeDepth = context.propagationScopeDepth;
  reactiveBatchState.batchDepth = context.batchDepth;
  reactiveBatchState.pendingReactiveSettled = context.pendingReactiveSettled;
  readTrackingStrategy = context.readTrackingStrategy;
  sinkInvalidatedHook = context.sinkInvalidatedHook;
  reactiveSettledHook = context.reactiveSettledHook;
  effectCleanupHook = context.effectCleanupHook;
}

export function commitRuntimeContext(
  context: RuntimeContext = activeRuntimeContext,
): void {
  context.currentConsumer = currentConsumer;
  context.trackingEpoch = trackingEpoch;
  context.propagationScopeDepth = propagationScopeDepth;
  context.batchDepth = reactiveBatchState.batchDepth;
  context.pendingReactiveSettled = reactiveBatchState.pendingReactiveSettled;
  context.readTrackingStrategy = readTrackingStrategy;
  context.sinkInvalidatedHook = sinkInvalidatedHook;
  context.reactiveSettledHook = reactiveSettledHook;
  context.effectCleanupHook = effectCleanupHook;
}

export function getActiveRuntimeContext(): RuntimeContext {
  return activeRuntimeContext;
}

export function setActiveRuntimeContext(context: RuntimeContext): void {
  if (context === activeRuntimeContext) return;

  commitRuntimeContext();
  activateRuntimeContext(context);
}

export function runWithRuntimeContext<T>(
  context: RuntimeContext,
  fn: () => T,
): T {
  profileRuntimeCounter("contextRunCalls");

  const previous = activeRuntimeContext;

  if (previous === context) return fn();

  profileRuntimeCounter("contextSwitches");

  commitRuntimeContext(previous);
  activateRuntimeContext(context);

  try {
    return fn();
  } finally {
    commitRuntimeContext(context);
    activateRuntimeContext(previous);
  }
}

export function nextTrackingEpoch(): number {
  return (trackingEpoch = (trackingEpoch + 1) >>> 0 || 1);
}

export function beginConsumerTracking(node: ReactiveNode): ReactiveNode | null {
  const previous = currentConsumer;
  trackingEpoch = (trackingEpoch + 1) >>> 0 || 1;
  currentConsumer = node;
  return previous;
}

export function restoreConsumer(node: ReactiveNode | null): void {
  currentConsumer = node;
}

export function setTrackingEpoch(epoch: number): void {
  if (((epoch - trackingEpoch) | 0) > 0) trackingEpoch = epoch;
}

export function isNewer(a: number, b: number): boolean {
  return ((a - b) | 0) > 0;
}

//
export function getCurrentConsumer(): ReactiveNode | null {
  return currentConsumer;
}

//
export function setCurrentConsumer(node: ReactiveNode | null): void {
  currentConsumer = node;
}

//
export function getPropagationScopeDepth(): number {
  return propagationScopeDepth;
}

//
export function setPropagationScopeDepth(depth: number): void {
  propagationScopeDepth = depth;
}

export function getBatchDepth(): number {
  return reactiveBatchState.batchDepth;
}

export function hasPendingReactiveSettled(): boolean {
  return reactiveBatchState.pendingReactiveSettled;
}

export function enterReactiveBatch(): void {
  reactiveBatchState.batchDepth += 1;
}

export function leaveReactiveBatch(): void {
  if (reactiveBatchState.batchDepth > 0) {
    reactiveBatchState.batchDepth -= 1;
  }

  flushPendingReactiveSettledIfIdle();
}

export function flushPendingReactiveSettledIfIdle(): void {
  if (reactiveBatchState.batchDepth !== 0) return;
  if (!reactiveBatchState.pendingReactiveSettled) return;
  if (propagationScopeDepth !== 0 || currentConsumer !== null) return;

  reactiveBatchState.pendingReactiveSettled = false;
  emitReactiveSettled();
}

export function runWithReactiveBatch<T>(fn: () => T): T {
  enterReactiveBatch();

  try {
    return fn();
  } finally {
    leaveReactiveBatch();
  }
}

export function enterPropagationScope(): void {
  profileRuntimeCounter("propagationScopesEntered");
  profileRuntimeCounter("contextPropagationEnter");

  ++propagationScopeDepth;
}

export function leavePropagationScope(): void {
  profileRuntimeCounter("propagationScopesLeft");
  profileRuntimeCounter("contextPropagationLeave");

  if (propagationScopeDepth > 0) --propagationScopeDepth;

  if (propagationScopeDepth === 0 && currentConsumer === null) {
    emitReactiveSettled();
  }
}

export function emitSinkInvalidated(node: ReactiveNode): void {
  profileRuntimeCounter("sinkInvalidatedEmits");

  if (IS_DEV) {
    recordDebugEvent(defaultContext, "watcher:invalidated", { node });
  }

  sinkInvalidatedHook?.(node);
}

export function emitSettledIfIdle(): void {
  profileRuntimeCounter("contextSettledChecks");

  if (propagationScopeDepth !== 0 || currentConsumer !== null) return;

  if (IS_DEV) {
    recordDebugEvent(defaultContext, "context:settled");
  }

  emitReactiveSettled();
}

function emitReactiveSettled(): void {
  if (reactiveBatchState.batchDepth !== 0) {
    reactiveBatchState.pendingReactiveSettled = true;
    profileRuntimeCounter("contextSettledDeferred");
    return;
  }

  profileRuntimeCounter("contextSettledEmits");

  reactiveSettledHook?.();
}

export function setSinkInvalidatedHook(
  hook: SinkInvalidatedHook = undefined,
): void {
  sinkInvalidatedHook = asHook<SinkInvalidatedHook>(hook);
  activeRuntimeContext.sinkInvalidatedHook = sinkInvalidatedHook;
}

export function setReactiveSettledHook(
  hook: ReactiveSettledHook = undefined,
): void {
  reactiveSettledHook = asHook<ReactiveSettledHook>(hook);
  activeRuntimeContext.reactiveSettledHook = reactiveSettledHook;
}

export function setEffectCleanupHook(
  hook: EffectCleanupHook = undefined,
): void {
  effectCleanupHook = asHook<EffectCleanupHook>(hook);
  activeRuntimeContext.effectCleanupHook = effectCleanupHook;
}

export function getEffectCleanupHook(): EffectCleanupHook {
  return effectCleanupHook;
}

export function getReactiveSettledHook(): ReactiveSettledHook {
  return reactiveSettledHook;
}

function ownHook<T>(
  hooks: RuntimeHooks,
  name: keyof RuntimeHooks,
): T | undefined {
  return Object.prototype.hasOwnProperty.call(hooks, name)
    ? asHook<T>(hooks[name])
    : undefined;
}

export function setRuntimeHooks(
  context: RuntimeContext,
  hooks?: RuntimeHooks,
): void;
export function setRuntimeHooks(hooks?: RuntimeHooks): void;
export function setRuntimeHooks(
  contextOrHooks: RuntimeContext | RuntimeHooks = {},
  maybeHooks: RuntimeHooks = {},
): void {
  const hasContext = isRuntimeContext(contextOrHooks);
  const context = hasContext ? contextOrHooks : activeRuntimeContext;
  const hooks = hasContext ? maybeHooks : contextOrHooks;

  context.sinkInvalidatedHook = ownHook<SinkInvalidatedHook>(
    hooks,
    "sinkInvalidatedDispatcher",
  );
  context.reactiveSettledHook = ownHook<ReactiveSettledHook>(
    hooks,
    "reactiveSettledDispatcher",
  );
  context.effectCleanupHook = ownHook<EffectCleanupHook>(
    hooks,
    "effectCleanupRegistrar",
  );

  reloadActiveContextIfCurrent(context);
}

export const setHostHooks = setRuntimeHooks;

export function setInternalHooks(
  sinkInvalidated: SinkInvalidatedHook = undefined,
  reactiveSettled: ReactiveSettledHook = undefined,
): void {
  setSinkInvalidatedHook(sinkInvalidated);
  setReactiveSettledHook(reactiveSettled);
}

export function setRuntimeContextOptions(
  context: RuntimeContext,
  options?: RuntimeContextOptions,
): void;
export function setRuntimeContextOptions(options?: RuntimeContextOptions): void;
export function setRuntimeContextOptions(
  contextOrOptions: RuntimeContext | RuntimeContextOptions = {},
  maybeOptions: RuntimeContextOptions = {},
): void {
  const hasContext = isRuntimeContext(contextOrOptions);
  const context = hasContext ? contextOrOptions : activeRuntimeContext;
  const options = hasContext ? maybeOptions : contextOrOptions;

  if ("readTrackingStrategy" in options) {
    context.readTrackingStrategy =
      asHook<ReadTrackingStrategy>(options.readTrackingStrategy) ??
      DEFAULT_READ_TRACKING_STRATEGY;
  }

  reloadActiveContextIfCurrent(context);
}

export function resetRuntimeContextOptions(
  context: RuntimeContext = activeRuntimeContext,
): void {
  context.currentConsumer = null;
  context.trackingEpoch = 0;
  context.propagationScopeDepth = 0;
  context.batchDepth = 0;
  context.pendingReactiveSettled = false;
  context.readTrackingStrategy = DEFAULT_READ_TRACKING_STRATEGY;
  context.sinkInvalidatedHook = undefined;
  context.reactiveSettledHook = undefined;
  context.effectCleanupHook = undefined;

  reloadActiveContextIfCurrent(context);
}

export function saveRuntimeContext(
  context: RuntimeContext = activeRuntimeContext,
): RuntimeContextSnapshot {
  if (context === activeRuntimeContext) commitRuntimeContext(context);

  return {
    currentConsumer: context.currentConsumer,
    trackingEpoch: context.trackingEpoch,
    propagationScopeDepth: context.propagationScopeDepth,
    batchDepth: context.batchDepth,
    pendingReactiveSettled: context.pendingReactiveSettled,
    readTrackingStrategy: context.readTrackingStrategy,
    sinkInvalidatedHook: context.sinkInvalidatedHook,
    reactiveSettledHook: context.reactiveSettledHook,
    effectCleanupHook: context.effectCleanupHook,
  };
}

export const saveContext = saveRuntimeContext;

export function restoreRuntimeContext(
  context: RuntimeContext,
  snapshot: RuntimeContextSnapshot,
): void {
  const currentEpoch =
    context === activeRuntimeContext ? trackingEpoch : context.trackingEpoch;

  context.currentConsumer = snapshot.currentConsumer;
  context.trackingEpoch =
    snapshot.trackingEpoch > currentEpoch
      ? snapshot.trackingEpoch
      : currentEpoch;
  context.propagationScopeDepth = snapshot.propagationScopeDepth;
  context.batchDepth = snapshot.batchDepth;
  context.pendingReactiveSettled = snapshot.pendingReactiveSettled;
  context.readTrackingStrategy = snapshot.readTrackingStrategy;
  context.sinkInvalidatedHook = snapshot.sinkInvalidatedHook;
  context.reactiveSettledHook = snapshot.reactiveSettledHook;
  context.effectCleanupHook = snapshot.effectCleanupHook;

  reloadActiveContextIfCurrent(context);
}

export function restoreContext(snapshot: RuntimeContextSnapshot): void {
  restoreRuntimeContext(activeRuntimeContext, snapshot);
}

export function resetState(
  context: RuntimeContext = activeRuntimeContext,
): void {
  resetRuntimeContextOptions(context);
}

export function reloadActiveContextIfCurrent(context: RuntimeContext): void {
  if (context === activeRuntimeContext) activateRuntimeContext(context);
}
