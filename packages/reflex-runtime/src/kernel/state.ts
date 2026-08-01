import type { ReactiveNode } from "./shape";

export const enum RuntimeState {
  Idle = 0,
  Tracking = 1 << 0,
  Propagating = 1 << 1,
  Batching = 1 << 2,
  IdlePending = 1 << 3,
}

const EXECUTION_ACTIVE = RuntimeState.Tracking | RuntimeState.Propagating;

/**
 * Compact runtime lifecycle register. `Idle` is exactly zero.
 */
export let runtimeState = RuntimeState.Idle;

export function setRuntimeState(state: number): void {
  runtimeState = state;
}

function setRuntimeStateFlag(flag: RuntimeState, enabled: boolean): void {
  runtimeState = enabled ? runtimeState | flag : runtimeState & ~flag;
}

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
  setRuntimeStateFlag(RuntimeState.Tracking, consumer !== null);
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
  setRuntimeStateFlag(RuntimeState.Tracking, true);
  trackingEpoch = (trackingEpoch + 1) >>> 0 || 1;
  return previousConsumer;
}

/**
 * Restore the previous dependency-tracking consumer.
 */
export function restoreConsumerTracking(
  previousConsumer: ReactiveNode | null,
): void {
  currentConsumer = previousConsumer;
  setRuntimeStateFlag(RuntimeState.Tracking, previousConsumer !== null);
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
  setRuntimeStateFlag(RuntimeState.Propagating, propagationScopeDepth !== 0);
}

/**
 * Enter a propagation scope.
 */
export function enterPropagationScopeRegister(): void {
  propagationScopeDepth++;
  setRuntimeStateFlag(RuntimeState.Propagating, true);
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

  setRuntimeStateFlag(RuntimeState.Propagating, propagationScopeDepth !== 0);
  return (runtimeState & EXECUTION_ACTIVE) === RuntimeState.Idle;
}

/**
 * Whether runtime execution is currently idle.
 */
export function isRuntimeExecutionIdle(): boolean {
  return (runtimeState & EXECUTION_ACTIVE) === RuntimeState.Idle;
}

// #endregion

// #region Reactive batch registers

/**
 * Current reactive batch nesting depth.
 */
export let reactiveBatchDepth = 0;

/**
 * Whether runtime work, batching, or an idle notification is pending.
 * `RuntimeState.Idle` (zero) means the runtime has no active lifecycle state.
 */
export function enterReactiveBatchRegister(): void {
  ++reactiveBatchDepth;
  setRuntimeStateFlag(RuntimeState.Batching, true);
}

export function leaveReactiveBatchRegister(): boolean {
  if (reactiveBatchDepth > 0) {
    --reactiveBatchDepth;
  }

  setRuntimeStateFlag(RuntimeState.Batching, reactiveBatchDepth !== 0);
  return reactiveBatchDepth === 0;
}

export function markRuntimeIdlePending(): void {
  setRuntimeStateFlag(RuntimeState.IdlePending, true);
}

export function clearRuntimeIdlePending(): void {
  setRuntimeStateFlag(RuntimeState.IdlePending, false);
}

export function setReactiveBatchState(
  batchDepth: number,
  state: number,
): void {
  reactiveBatchDepth = batchDepth < 0 ? 0 : batchDepth;
  setRuntimeState(state);
}

export function isReactiveBatchActive(): boolean {
  return (runtimeState & RuntimeState.Batching) !== RuntimeState.Idle;
}

// #endregion
