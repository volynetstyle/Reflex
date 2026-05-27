import {
  DEFAULT_GRAPH_REDUCTION_OPTIONS,
  DEFAULT_READ_TRACKING_STRATEGY,
} from "./defaults";
import { normalizeHook } from "./hooks";
import {
  normalizeGraphReductionOptions,
  type NormalizedGraphReductionOptions,
} from "../reduction";
import type { ReactiveNode } from "../shape";
import { RUNTIME_CONTEXT_BRAND } from "./types";
import type {
  ReactiveSettledHook,
  EffectCleanupHook,
  ReadTrackingStrategy,
  RuntimeContext,
  RuntimeContextOptions,
  SinkInvalidatedHook,
} from "./types";

export let currentConsumer: ReactiveNode | null = null;
export let trackingEpoch = 0;
export let propagationScopeDepth = 0;
export let readTrackingStrategy: ReadTrackingStrategy =
  DEFAULT_READ_TRACKING_STRATEGY;
export let graphReductionPolicy: NormalizedGraphReductionOptions =
  DEFAULT_GRAPH_REDUCTION_OPTIONS;

export let internalSinkInvalidatedHook: SinkInvalidatedHook = undefined;
export let internalReactiveSettledHook: ReactiveSettledHook = undefined;
export let hostSinkInvalidatedHook: SinkInvalidatedHook = undefined;
export let hostReactiveSettledHook: ReactiveSettledHook = undefined;
export let hostEffectCleanupHook: EffectCleanupHook = undefined;
let activeRuntimeContext: RuntimeContext;

export function createRuntimeContext(
  options: RuntimeContextOptions = {},
): RuntimeContext {
  const context: RuntimeContext = {
    [RUNTIME_CONTEXT_BRAND]: true,
    currentConsumer: null,
    trackingEpoch: 0,
    propagationScopeDepth: 0,
    readTrackingStrategy:
      normalizeHook<ReadTrackingStrategy>(options.readTrackingStrategy) ??
      DEFAULT_READ_TRACKING_STRATEGY,
    graphReductionPolicy: normalizeGraphReductionOptions(
      options.graphReductionPolicy,
    ),
    internalSinkInvalidatedHook: undefined,
    internalReactiveSettledHook: undefined,
    hostSinkInvalidatedHook: undefined,
    hostReactiveSettledHook: undefined,
    hostEffectCleanupHook: undefined,
  };

  return context;
}

export const defaultRuntimeContext = createRuntimeContext();
activeRuntimeContext = defaultRuntimeContext;

export function activateRuntimeContext(context: RuntimeContext): void {
  activeRuntimeContext = context;

  currentConsumer = context.currentConsumer;
  trackingEpoch = context.trackingEpoch;
  propagationScopeDepth = context.propagationScopeDepth;
  readTrackingStrategy = context.readTrackingStrategy;
  graphReductionPolicy = context.graphReductionPolicy;
  internalSinkInvalidatedHook = context.internalSinkInvalidatedHook;
  internalReactiveSettledHook = context.internalReactiveSettledHook;
  hostSinkInvalidatedHook = context.hostSinkInvalidatedHook;
  hostReactiveSettledHook = context.hostReactiveSettledHook;
  hostEffectCleanupHook = context.hostEffectCleanupHook;
}

export function commitRuntimeContext(
  context: RuntimeContext = activeRuntimeContext,
): void {
  context.currentConsumer = currentConsumer;
  context.trackingEpoch = trackingEpoch;
  context.propagationScopeDepth = propagationScopeDepth;
  context.readTrackingStrategy = readTrackingStrategy;
  context.graphReductionPolicy = graphReductionPolicy;
  context.internalSinkInvalidatedHook = internalSinkInvalidatedHook;
  context.internalReactiveSettledHook = internalReactiveSettledHook;
  context.hostSinkInvalidatedHook = hostSinkInvalidatedHook;
  context.hostReactiveSettledHook = hostReactiveSettledHook;
  context.hostEffectCleanupHook = hostEffectCleanupHook;
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
  const previousContext = activeRuntimeContext;

  if (previousContext === context) {
    return fn();
  }

  commitRuntimeContext(previousContext);
  activateRuntimeContext(context);

  try {
    return fn();
  } finally {
    commitRuntimeContext(context);
    activateRuntimeContext(previousContext);
  }
}

// @__INLINE__
export function getCurrentConsumer(): ReactiveNode | null {
  return currentConsumer;
}

// @__INLINE__
export function setCurrentConsumer(node: ReactiveNode | null): void {
  currentConsumer = node;
}

// @__INLINE__
export function getPropagationScopeDepth(): number {
  return propagationScopeDepth;
}

// @__INLINE__
export function setPropagationScopeDepth(depth: number): void {
  propagationScopeDepth = depth;
}

// @__INLINE__
export function incrementPropagationScopeDepth(): void {
  ++propagationScopeDepth;
}

// @__INLINE__
export function decrementPropagationScopeDepth(): void {
  if (propagationScopeDepth > 0) --propagationScopeDepth;
}

// @__INLINE__
export function setTrackingEpoch(epoch: number): void {
  if (epoch > trackingEpoch) trackingEpoch = epoch;
}

// @__INLINE__
export function nextTrackingEpoch(): void {
  trackingEpoch = (trackingEpoch + 1) >>> 0 || 1;
}

export function isNewer(a: number, b: number): boolean {
  return ((a - b) | 0) > 0;
}

export function getSinkInvalidatedHook(): SinkInvalidatedHook {
  return hostSinkInvalidatedHook;
}

export function setSinkInvalidatedHook(
  hook: SinkInvalidatedHook = undefined,
): void {
  hostSinkInvalidatedHook = normalizeHook<SinkInvalidatedHook>(hook);
  activeRuntimeContext.hostSinkInvalidatedHook = hostSinkInvalidatedHook;
}

export function getReactiveSettledHook(): ReactiveSettledHook {
  return hostReactiveSettledHook;
}

export function getEffectCleanupHook(): EffectCleanupHook {
  return hostEffectCleanupHook;
}

export function setReactiveSettledHook(
  hook: ReactiveSettledHook = undefined,
): void {
  hostReactiveSettledHook = normalizeHook<ReactiveSettledHook>(hook);
  activeRuntimeContext.hostReactiveSettledHook = hostReactiveSettledHook;
}

export function setEffectCleanupHook(
  hook: EffectCleanupHook = undefined,
): void {
  hostEffectCleanupHook = normalizeHook<EffectCleanupHook>(hook);
  activeRuntimeContext.hostEffectCleanupHook = hostEffectCleanupHook;
}

export function reloadActiveContextIfCurrent(context: RuntimeContext): void {
  if (context === activeRuntimeContext) {
    activateRuntimeContext(context);
  }
}
