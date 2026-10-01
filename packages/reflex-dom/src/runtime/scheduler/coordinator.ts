import {
  enterReactiveBatch,
  leaveReactiveBatch,
  type ReactiveNode,
} from "@volynets/reflex-runtime/internal";
import {
  resolveEffectSchedulerMode,
  type RuntimeSchedulerBinding,
} from "@volynets/reflex-scheduler";
import type { MountEffects } from "../mount-effects";
import type { HostCarrier, HostToken } from "./host-carrier";

export interface DOMSchedulerCoordinator {
  onNodeInvalidated(node: ReactiveNode): void;
  onRuntimeIdle(): void;
  batch<T>(fn: () => T): T;
  flush(): void;
}

export function createDOMSchedulerCoordinator(
  scheduler: RuntimeSchedulerBinding,
  mountEffects: MountEffects | undefined,
  carrier: HostCarrier,
  run: <T>(fn: () => T) => T,
): DOMSchedulerCoordinator {
  const deferred = scheduler.mode === resolveEffectSchedulerMode("flush");
  let batchDepth = 0;
  let settled = false;
  let draining = false;
  let flushingEffects = false;
  let hostRequest: HostToken | null = null;

  const commitIfSettled = (): void => {
    if (flushingEffects) return;
    if (!settled || batchDepth !== 0 || draining || scheduler.hasPending()) {
      return;
    }
    flushingEffects = true;
    try {
      do {
        settled = false;
        // An effect can enqueue deferred reactive work. Later first runs wait
        // until that work settles, instead of observing stale DOM.
        mountEffects?.flush(() => !scheduler.hasPending());
      } while (
        settled &&
        batchDepth === 0 &&
        !draining &&
        !scheduler.hasPending()
      );
    } finally {
      flushingEffects = false;
    }
  };

  const drain = (): void => {
    const wasDraining = draining;
    draining = true;
    try {
      scheduler.flush();
    } finally {
      draining = wasDraining;
    }
    settled = true;
    commitIfSettled();
  };

  const resume = (token: HostToken): void => {
    if (hostRequest !== token) return;
    hostRequest = null;
    run(drain);
  };

  const requestIfPending = (): void => {
    if (!draining && hostRequest === null && scheduler.hasPending()) {
      hostRequest = carrier.postMicrotask(resume);
    }
  };

  return {
    onNodeInvalidated: deferred
      ? (node) => {
          scheduler.onNodeInvalidated(node);
          if (batchDepth === 0) requestIfPending();
        }
      : scheduler.onNodeInvalidated,
    onRuntimeIdle() {
      settled = true;
      if (deferred && batchDepth === 0) requestIfPending();
      commitIfSettled();
    },
    batch<T>(fn: () => T): T {
      return run(() => {
        batchDepth++;
        enterReactiveBatch();
        try {
          return scheduler.batch(fn);
        } finally {
          try {
            leaveReactiveBatch();
          } finally {
            batchDepth--;
            if (batchDepth === 0) {
              // Mounting static DOM may produce no runtime idle notification.
              settled = true;
              if (deferred) requestIfPending();
              commitIfSettled();
            }
          }
        }
      });
    },
    flush() {
      hostRequest = null;
      run(drain);
    },
  };
}
