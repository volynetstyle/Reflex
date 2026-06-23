import { recordDebugEvent } from "../debug/debug.runtime";
import { profileRuntimeCounter } from "../profiling";
import {
  DEFAULT_READ_TRACKING_STRATEGY,
  defaultContext,
  effectCleanupHook,
  emitReactiveSettled,
  emitSinkInvalidated,
  getEffectCleanupHook,
  getReactiveSettledHook,
  reactiveSettledHook,
  readTrackingStrategy,
  resetRuntimeConfiguration,
  restoreRuntimeConfiguration,
  saveRuntimeConfiguration,
  setEffectCleanupHook as setConfiguredEffectCleanupHook,
  setReadTrackingStrategy as setConfiguredReadTrackingStrategy,
  setReactiveSettledHook as setConfiguredReactiveSettledHook,
  setSinkInvalidatedHook as setConfiguredSinkInvalidatedHook,
  sinkInvalidatedHook,
  type EffectCleanupHook,
  type ReactiveSettledHook,
  type ReadTrackingStrategy,
  type RuntimeConfiguration,
  type RuntimeConfigurationOptions,
  type RuntimeDebugContext,
  type RuntimeHooks,
  type RuntimeHostHooks,
  type SinkInvalidatedHook,
} from "./config";
import {
  advanceTrackingEpoch,
  clearReactiveSettledPending,
  currentConsumer,
  enterConsumerTracking,
  enterPropagationScopeRegister,
  enterReactiveBatchRegister,
  hasPendingReactiveSettled,
  isNewerEpoch,
  isReactiveBatchActive,
  isRuntimeExecutionIdle,
  keepNewestTrackingEpoch,
  leavePropagationScopeRegister,
  leaveReactiveBatchRegister,
  markReactiveSettledPending,
  pendingReactiveSettled,
  propagationScopeDepth,
  reactiveBatchDepth,
  restoreConsumerTracking,
  setCurrentConsumer,
  setPropagationScopeDepth,
  setReactiveBatchState,
  setTrackingEpoch as setTrackingEpochRegister,
  trackingEpoch,
} from "./state";
import { resetRuntimeExecutionState } from "./execution";
import type { ReactiveNode } from "./shape";

export {
  DEFAULT_READ_TRACKING_STRATEGY,
  currentConsumer,
  defaultContext,
  effectCleanupHook,
  emitSinkInvalidated,
  getEffectCleanupHook,
  getReactiveSettledHook,
  propagationScopeDepth,
  reactiveBatchDepth,
  reactiveSettledHook,
  readTrackingStrategy,
  setCurrentConsumer,
  setPropagationScopeDepth,
  sinkInvalidatedHook,
  trackingEpoch,
  type EffectCleanupHook,
  type ReactiveSettledHook,
  type ReadTrackingStrategy,
  type RuntimeDebugContext,
  type RuntimeHooks,
  type RuntimeHostHooks,
  type SinkInvalidatedHook,
};

export const RUNTIME_CONTEXT_BRAND: unique symbol = Symbol("RuntimeContext");

export type RuntimeContextOptions = RuntimeConfigurationOptions;

export interface RuntimeContext extends RuntimeConfiguration {
  readonly [RUNTIME_CONTEXT_BRAND]: true;
  currentConsumer: ReactiveNode | null;
  trackingEpoch: number;
  propagationScopeDepth: number;
  batchDepth: number;
  pendingReactiveSettled: boolean;
}

export type RuntimeContextSnapshot = Omit<
  RuntimeContext,
  typeof RUNTIME_CONTEXT_BRAND
>;

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

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

  setCurrentConsumer(context.currentConsumer);
  setTrackingEpochRegister(context.trackingEpoch);
  setPropagationScopeDepth(context.propagationScopeDepth);
  setReactiveBatchState(context.batchDepth, context.pendingReactiveSettled);
  restoreRuntimeConfiguration(context);
}

export function commitRuntimeContext(
  context: RuntimeContext = activeRuntimeContext,
): void {
  context.currentConsumer = currentConsumer;
  context.trackingEpoch = trackingEpoch;
  context.propagationScopeDepth = propagationScopeDepth;
  context.batchDepth = reactiveBatchDepth;
  context.pendingReactiveSettled = pendingReactiveSettled;

  const configuration = saveRuntimeConfiguration();
  context.readTrackingStrategy = configuration.readTrackingStrategy;
  context.sinkInvalidatedHook = configuration.sinkInvalidatedHook;
  context.reactiveSettledHook = configuration.reactiveSettledHook;
  context.effectCleanupHook = configuration.effectCleanupHook;
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
  return advanceTrackingEpoch();
}

export function beginConsumerTracking(node: ReactiveNode): ReactiveNode | null {
  return enterConsumerTracking(node);
}

export function restoreConsumer(node: ReactiveNode | null): void {
  restoreConsumerTracking(node);
}

export function setTrackingEpoch(epoch: number): void {
  keepNewestTrackingEpoch(epoch);
}

export function isNewer(a: number, b: number): boolean {
  return isNewerEpoch(a, b);
}

export function getCurrentConsumer(): ReactiveNode | null {
  return currentConsumer;
}

export function getPropagationScopeDepth(): number {
  return propagationScopeDepth;
}

export function getBatchDepth(): number {
  return reactiveBatchDepth;
}

export { hasPendingReactiveSettled };

export function enterReactiveBatch(): void {
  enterReactiveBatchRegister();
}

export function leaveReactiveBatch(): void {
  leaveReactiveBatchRegister();
  flushPendingReactiveSettledIfIdle();
}

export function flushPendingReactiveSettledIfIdle(): void {
  if (isReactiveBatchActive()) return;
  if (!hasPendingReactiveSettled()) return;
  if (!isRuntimeExecutionIdle()) return;

  clearReactiveSettledPending();
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

  enterPropagationScopeRegister();
}

export function leavePropagationScope(): void {
  profileRuntimeCounter("propagationScopesLeft");
  profileRuntimeCounter("contextPropagationLeave");

  if (leavePropagationScopeRegister()) {
    emitReactiveSettledWithBatching();
  }
}

export function emitSettledIfIdle(): void {
  profileRuntimeCounter("contextSettledChecks");

  if (!isRuntimeExecutionIdle()) return;

  if (IS_DEV) {
    recordDebugEvent(defaultContext, "context:settled");
  }

  emitReactiveSettledWithBatching();
}

function emitReactiveSettledWithBatching(): void {
  if (isReactiveBatchActive()) {
    markReactiveSettledPending();
    profileRuntimeCounter("contextSettledDeferred");
    return;
  }

  emitReactiveSettled();
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
  activeRuntimeContext.sinkInvalidatedHook = sinkInvalidatedHook;
  activeRuntimeContext.reactiveSettledHook = reactiveSettledHook;
}

export function setSinkInvalidatedHook(
  hook: SinkInvalidatedHook = undefined,
): void {
  setConfiguredSinkInvalidatedHook(hook);
  activeRuntimeContext.sinkInvalidatedHook = sinkInvalidatedHook;
}

export function setReactiveSettledHook(
  hook: ReactiveSettledHook = undefined,
): void {
  setConfiguredReactiveSettledHook(hook);
  activeRuntimeContext.reactiveSettledHook = reactiveSettledHook;
}

export function setEffectCleanupHook(
  hook: EffectCleanupHook = undefined,
): void {
  setConfiguredEffectCleanupHook(hook);
  activeRuntimeContext.effectCleanupHook = effectCleanupHook;
}

export function setReadTrackingStrategy(
  strategy: ReadTrackingStrategy | null | undefined,
): void {
  setConfiguredReadTrackingStrategy(strategy);
  activeRuntimeContext.readTrackingStrategy = readTrackingStrategy;
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
  resetRuntimeExecutionState();

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

function ownHook<T>(
  hooks: RuntimeHooks,
  name: keyof RuntimeHooks,
): T | undefined {
  return Object.prototype.hasOwnProperty.call(hooks, name)
    ? asHook<T>(hooks[name])
    : undefined;
}

export { resetRuntimeConfiguration };
