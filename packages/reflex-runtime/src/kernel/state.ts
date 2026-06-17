import type { ReactiveNode } from "./shape";

/**
 * Runtime execution registers.
 *
 * These are intentionally module-level mutable bindings.
 * They sit on the hot path, so access should stay as cheap as possible:
 * direct reads/writes beat object property indirection here.
 */

// #region Tracking consumer register

/**
 * The consumer currently collecting dependencies.
 *
 * `null` means dependency tracking is disabled.
 */
export let currentConsumer: ReactiveNode | null = null;

/**
 * Replace the active dependency-tracking consumer.
 */
export function setCurrentConsumer(consumer: ReactiveNode | null): void {
  currentConsumer = consumer;
}

/**
 * Start tracking reads for the given consumer.
 *
 * Returns the previous consumer so the caller can restore it later.
 */
export function enterConsumerTracking(
  consumer: ReactiveNode,
): ReactiveNode | null {
  const previousConsumer = currentConsumer;
  currentConsumer = consumer;
  advanceTrackingEpoch();
  return previousConsumer;
}

/**
 * Restore the previous dependency-tracking consumer.
 */
export function restoreConsumerTracking(
  previousConsumer: ReactiveNode | null,
): void {
  currentConsumer = previousConsumer;
}

// #endregion

// #region Tracking epoch register

/**
 * Monotonic dependency-tracking epoch.
 *
 * Used to mark reads during a tracking pass.
 * Wraps around safely and skips zero.
 */
export let trackingEpoch = 0;

/**
 * Replace the tracking epoch.
 *
 * Mostly useful for context restore / tests.
 */
export function setTrackingEpoch(epoch: number): void {
  trackingEpoch = epoch >>> 0;
}

/**
 * Advance the tracking epoch and return the new value.
 */
export function advanceTrackingEpoch(): number {
  trackingEpoch = (trackingEpoch + 1) >>> 0 || 1;
  return trackingEpoch;
}

/**
 * Keep the newest epoch according to uint32 wraparound ordering.
 */
export function keepNewestTrackingEpoch(epoch: number): void {
  if (((epoch - trackingEpoch) | 0) > 0) {
    trackingEpoch = epoch;
  }
}

/**
 * Compare two uint32-style epochs.
 */
export function isNewerEpoch(a: number, b: number): boolean {
  return ((a - b) | 0) > 0;
}

// #endregion

// #region Propagation scope register

/**
 * Current propagation nesting depth.
 *
 * Non-zero means the runtime is inside invalidation / propagation work.
 */
export let propagationScopeDepth = 0;

/**
 * Replace propagation depth.
 *
 * Mostly useful for context restore / tests.
 */
export function setPropagationScopeDepth(depth: number): void {
  propagationScopeDepth = depth < 0 ? 0 : depth;
}

/**
 * Enter a propagation scope.
 */
export function enterPropagationScopeRegister(): void {
  propagationScopeDepth++;
}

/**
 * Leave a propagation scope.
 *
 * Returns `true` when propagation became idle.
 */
export function leavePropagationScopeRegister(): boolean {
  if (propagationScopeDepth > 0) {
    propagationScopeDepth--;
  }

  return propagationScopeDepth === 0 && currentConsumer === null;
}

/**
 * Whether runtime execution is currently idle.
 */
export function isRuntimeExecutionIdle(): boolean {
  return propagationScopeDepth === 0 && currentConsumer === null;
}

// #endregion

// #region Reactive batch registers

/**
 * Current reactive batch nesting depth.
 */
export let reactiveBatchDepth = 0;

/**
 * Whether a settled notification was deferred while inside a batch.
 */
export let pendingReactiveSettled = false;

export function enterReactiveBatchRegister(): void {
  reactiveBatchDepth++;
}

export function leaveReactiveBatchRegister(): boolean {
  if (reactiveBatchDepth > 0) {
    reactiveBatchDepth--;
  }

  return reactiveBatchDepth === 0;
}

export function markReactiveSettledPending(): void {
  pendingReactiveSettled = true;
}

export function clearReactiveSettledPending(): void {
  pendingReactiveSettled = false;
}

export function setReactiveBatchState(
  batchDepth: number,
  pendingSettled: boolean,
): void {
  reactiveBatchDepth = batchDepth < 0 ? 0 : batchDepth;
  pendingReactiveSettled = pendingSettled;
}

export function hasPendingReactiveSettled(): boolean {
  return pendingReactiveSettled;
}

export function isReactiveBatchActive(): boolean {
  return reactiveBatchDepth !== 0;
}

// #endregion
