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
  flushSchedulerQueue,
  leaveSchedulerBatch,
} from "./scheduler.core";
import { tryEnqueue } from "./scheduler.enqueue";
import { notifyEffectSchedulerSettled } from "./scheduler.infra";
import type { SchedulerCore } from "./scheduler.types";

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

  const flush = (): void => {
    try {
      flushSchedulerQueue(core);
    } finally {
      cancelHostFlushRequest();
    }
  };

  const onNodeInvalidated = (node: ReactiveNode): void => {
    if (
      tryEnqueue(queue, node) &&
      mode === EffectSchedulerMode.Eager &&
      core.batchDepth === 0
    ) {
      requestHostFlush();
    }
  };

  const onHostFlush =
    mode === EffectSchedulerMode.Eager
      ? (): void => {
          profileSchedulerPolicyCounter("settleCalled");
          notifyEffectSchedulerSettled(core, mode);
        }
      : undefined;

  const leaveBatch = (): void => {
    profileSchedulerPolicyCounter("batchExit");

    if (!leaveSchedulerBatch(core)) return;

    if (
      (mode === EffectSchedulerMode.Eager && hasPendingEffects(core)) ||
      (mode === EffectSchedulerMode.SAB &&
        hasPendingEffects(core) &&
        isContextSettled(context))
    ) {
      flush();
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
