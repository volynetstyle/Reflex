import { profileRuntimeCounter } from "@runtime/profiling";

import { emitReactiveSettled } from "./config";
import {
  clearReactiveSettledPending,
  enterReactiveBatchRegister,
  isReactiveBatchActive,
  isRuntimeExecutionIdle,
  leaveReactiveBatchRegister,
  markReactiveSettledPending,
  pendingReactiveSettled,
} from "./state";

/**
 * Enters a reactive batch boundary.
 *
 * Writes and invalidations still happen immediately, and lazy consumers still
 * recompute on demand. The boundary only defers host-visible reactive-settled
 * notifications. Effect scheduling belongs to the host scheduler and is not
 * part of this operation.
 */
export function enterReactiveBatch(): void {
  enterReactiveBatchRegister();
}

/**
 * Leaves a reactive batch boundary.
 *
 * The outermost exit delivers one deferred reactive-settled notification when
 * runtime execution is idle. This is the complete runtime exit operation;
 * callers must not inspect or flush settlement registers themselves.
 */
export function leaveReactiveBatch(): void {
  leaveReactiveBatchRegister();
  flushPendingReactiveSettledIfIdle();
}

export function flushPendingReactiveSettledIfIdle(): void {
  if (!pendingReactiveSettled) return;
  if (isReactiveBatchActive()) return;
  if (!isRuntimeExecutionIdle()) return;

  clearReactiveSettledPending();
  emitReactiveSettled();
}

export function emitReactiveSettledWithBatching(): void {
  if (isReactiveBatchActive()) {
    markReactiveSettledPending();
    profileRuntimeCounter("contextSettledDeferred");
    return;
  }

  // A batch can end while propagation/tracking is still active. The next idle
  // checkpoint owns delivery of that deferred notification.
  if (pendingReactiveSettled) clearReactiveSettledPending();
  emitReactiveSettled();
}
