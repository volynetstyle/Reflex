import {
  cancelHostFlushRequest,
  requestHostFlush,
  type ReactiveNode,
  type RuntimeContext,
} from "@volynets/reflex-runtime/internal";

import { EffectSchedulerMode } from "./scheduler.constants";
import { hasPendingEffects, isContextSettled } from "./scheduler.context";
import { profileSchedulerPolicyCounter } from "./scheduler.counters";
import {
  createSchedulerCore,
  enterSchedulerBatch,
  flushPendingSchedulerQueue,
  flushSchedulerQueue,
  leaveSchedulerBatch,
} from "./scheduler.core";
import { tryEnqueue } from "./scheduler.enqueue";
import { notifyEffectSchedulerSettled } from "./scheduler.infra";
import type { SchedulerCore } from "./scheduler.types";

const SCHEDULER_PROFILE_ENABLED =
  typeof __PROFILE__ !== "undefined" && __PROFILE__;

export interface RuntimeSchedulerBinding {
  readonly mode: EffectSchedulerMode;
  readonly core: SchedulerCore;
  readonly onNodeInvalidated: (node: ReactiveNode) => void;
  readonly onHostFlush: (() => void) | undefined;
  batch<T>(fn: () => T): T;
  enterBatch(): void;
  leaveBatch(): void;
  flush(): void;
  hasPending(): boolean;
}

export function createRuntimeSchedulerBinding(
  mode: EffectSchedulerMode,
  context?: RuntimeContext,
): RuntimeSchedulerBinding {
  const core = createSchedulerCore();
  const queue = core.queue;

  // Select policy once. Deferred schedulers never request a host drain, so
  // their enqueue/flush paths need neither eager checks nor host flag writes.
  const eager = mode === EffectSchedulerMode.Eager;
  const flush = eager
    ? (): void => {
        try {
          flushSchedulerQueue(core);
        } finally {
          cancelHostFlushRequest();
        }
      }
    : (): void => flushSchedulerQueue(core);
  const onNodeInvalidated = eager
    ? (node: ReactiveNode): void => {
        if (tryEnqueue(queue, node) && core.batchDepth === 0) {
          requestHostFlush();
        }
      }
    : (node: ReactiveNode): void => {
        tryEnqueue(queue, node);
      };
  const onHostFlush = eager
    ? (): void => {
        if (SCHEDULER_PROFILE_ENABLED)
          profileSchedulerPolicyCounter("settleCalled");
        notifyEffectSchedulerSettled(core, mode);
      }
    : undefined;

  // Outer batch exit already establishes a non-flushing phase. Drain the
  // known pending queue without repeating the explicit-flush guards.
  const drainBatch = eager
    ? (): void => {
        try {
          if (SCHEDULER_PROFILE_ENABLED) flushSchedulerQueue(core);
          else flushPendingSchedulerQueue(core);
        } finally {
          cancelHostFlushRequest();
        }
      }
    : mode === EffectSchedulerMode.SAB
      ? (): void => {
          if (isContextSettled(context)) {
            if (SCHEDULER_PROFILE_ENABLED) flushSchedulerQueue(core);
            else flushPendingSchedulerQueue(core);
          }
        }
      : undefined;
  const leaveBatch = (): void => {
    if (SCHEDULER_PROFILE_ENABLED) profileSchedulerPolicyCounter("batchExit");
    if (
      leaveSchedulerBatch(core) &&
      drainBatch !== undefined &&
      hasPendingEffects(core)
    ) {
      drainBatch();
    }
  };

  return {
    mode,
    core,
    onNodeInvalidated,
    onHostFlush,
    batch<T>(fn: () => T): T {
      enterSchedulerBatch(core);
      try {
        return fn();
      } finally {
        leaveBatch();
      }
    },
    enterBatch() {
      enterSchedulerBatch(core);
    },
    leaveBatch,
    flush,
    hasPending() {
      return queue.head !== queue.tail;
    },
  };
}
