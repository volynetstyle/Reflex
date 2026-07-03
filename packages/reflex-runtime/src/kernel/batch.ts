import { profileRuntimeCounter } from "@runtime/profiling";

import { emitReactiveSettled } from "./config";
import {
  clearReactiveSettledPending,
  enterReactiveBatchRegister,
  hasPendingReactiveSettled,
  isReactiveBatchActive,
  isRuntimeExecutionIdle,
  leaveReactiveBatchRegister,
  markReactiveSettledPending,
} from "./state";

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

export function emitReactiveSettledWithBatching(): void {
  if (isReactiveBatchActive()) {
    markReactiveSettledPending();
    profileRuntimeCounter("contextSettledDeferred");
    return;
  }

  emitReactiveSettled();
}
