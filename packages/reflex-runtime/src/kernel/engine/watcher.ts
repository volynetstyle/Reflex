import { defaultContext } from "@runtime/kernel/config";
import { flushPendingRuntimeIdle } from "@runtime/kernel/batch";
import {
  currentConsumer,
  RuntimeState,
  runtimeState,
  setCurrentConsumer,
} from "@runtime/kernel/state";
import {
  devRecordWatcherCleanup,
  devRecordWatcherDispose,
  devRecordWatcherFinish,
  devRecordWatcherSkip,
  devRecordWatcherStart,
} from "@runtime/kernel/dev";
import {
  devAssertNoRuntimeHookWatcherExecution,
  devAssertNoRuntimeHookTopologyMutation,
  enterRuntimePhase,
  leaveRuntimePhase,
  RuntimePhase,
} from "@runtime/kernel/execution";
import {
  DIRTY_STATE,
  disposeNode,
  Changed,
  Computing,
  Unknown,
  Scheduled,
  Visited,
  type WatcherCleanup,
  type WatcherNode,
} from "@runtime/kernel/shape";
import { pull_iterator } from "@runtime/kernel/stages/second/pull_iterator";
import { observeRuntimeProjection } from "@runtime/kernel/projection";

import { executeKnownNodeComputation } from "./watcher.execution";

const FORCE_STABILIZATION_STATE = Changed | Visited;
const WATCHER_TRANSIENT_STATE = DIRTY_STATE | Visited | Computing | Scheduled;

function recoverWatcherAfterError(node: WatcherNode): void {
  // A failed lifecycle callback must not leave an unscheduled dirty watcher:
  // such a node can no longer be invalidated and becomes a zombie. Keep its
  // dependency set as a conservative retry set, but return it to an idle
  // state so the next source change can schedule it again.
  node.state &= ~WATCHER_TRANSIENT_STATE;
}
/**
 * Pull validation failed before watcher lifecycle execution began. Preserve
 * committed dependencies and cleanup, but canonicalize transient traversal
 * state so an explicit later run retries validation from the beginning.
 */
function recoverWatcherAfterValidationError(node: WatcherNode): void {
  const retryState = (node.state & Changed) !== 0 ? Changed : Unknown;
  node.state = (node.state & ~WATCHER_TRANSIENT_STATE) | retryState;
}
/**
 * A watcher callback can fail because a nested reactive read failed. That is
 * semantically an incomplete validation, even when a warmed cache promoted
 * the watcher to Changed and selected the direct execution path. Detect this
 * only after an exception; successful watcher execution pays no scan cost.
 */
function recoverWatcherAfterComputationError(node: WatcherNode): void {
  for (let edge = node.firstIn; edge !== null; edge = edge.nextIn) {
    if ((edge.from.state & DIRTY_STATE) !== 0) {
      recoverWatcherAfterValidationError(node);
      return;
    }
  }

  recoverWatcherAfterError(node);
}

/** Claims ownership of this watcher for an external scheduler queue. */
export function claimWatcherSchedule(node: WatcherNode): boolean {
  const state = node.state;

  if ((state & Scheduled) !== 0) return false;

  node.state = state | Scheduled;
  return true;
}

/** Releases ownership of this watcher from an external scheduler queue. */
export function releaseWatcherSchedule(node: WatcherNode): void {
  node.state &= ~Scheduled;
}

function runCleanup(cleanup: WatcherCleanup): void {
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.watcher.cleanup");

  const prevActive = currentConsumer;

  if (prevActive === null) {
    cleanup();
    return;
  }

  setCurrentConsumer(null);

  try {
    cleanup();
  } finally {
    setCurrentConsumer(prevActive);
  }
}

export function runWatcher(node: WatcherNode): void {
  runWatcherWithoutSettledCheckpoint(node);
  if ((runtimeState & RuntimeState.IdlePending) !== RuntimeState.Idle) {
    flushPendingRuntimeIdle();
  }
}

/** Scheduler drain entry point; the caller owns one checkpoint after draining. */
export const runWatcherWithoutSettledCheckpoint = !__DEV__
  ? runWatcherCore
  : function (node: WatcherNode): void {
      devAssertNoRuntimeHookWatcherExecution();
      enterRuntimePhase(RuntimePhase.WatcherExecution);
      try {
        runWatcherCore(node);
      } finally {
        leaveRuntimePhase();
      }
    };

function runWatcherCore(node: WatcherNode): void {
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.watcher.run");

  const state = node.state;

  if ((state & DIRTY_STATE) === 0) {
    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.watcher.clean.skip");

    devRecordWatcherSkip(node, "clean", defaultContext);
    return;
  }

  if ((state & FORCE_STABILIZATION_STATE) === 0) {
    const edge = node.firstIn;

    let changed: boolean;

    try {
      changed = edge !== null && pull_iterator(node, edge);
    } catch (error) {
      recoverWatcherAfterValidationError(node);
      throw error;
    }

    if (!changed) {
      if (__PROFILE__)
        observeRuntimeProjection?.("projection.semantic.watcher.stable.skip");

      node.state &= ~DIRTY_STATE;
      devRecordWatcherSkip(node, "stable", defaultContext);
      return;
    }

    // Validation confirmed a semantic change. Preserve that committed fact
    // across a callback failure so cold recovery cannot demote it to Unknown.
    node.state = (node.state & ~Unknown) | Changed;
  }

  if (node.compute === undefined) {
    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.watcher.disposed.skip");

    node.state &= ~DIRTY_STATE;
    devRecordWatcherSkip(node, "stable", defaultContext);
    return;
  }

  const compute = node.compute;
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.watcher.execute");

  const payload = node.payload;
  const prevCleanup = typeof payload === "function" ? payload : null;

  if (__DEV__)
    devRecordWatcherStart(node, prevCleanup !== null, defaultContext);

  node.payload = undefined;
  node.state &= ~Visited;

  if (prevCleanup !== null) {
    try {
      runCleanup(prevCleanup);
    } catch (error) {
      recoverWatcherAfterError(node);
      throw error;
    }
    devRecordWatcherCleanup(node, defaultContext);

    if (node.compute === undefined) {
      node.state &= ~DIRTY_STATE;
      if (__DEV__) {
        devRecordWatcherFinish(node, false, undefined, defaultContext);
      }
      return;
    }
  }

  let result: ReturnType<typeof compute>;

  try {
    result = executeKnownNodeComputation(node, compute);
  } catch (error) {
    recoverWatcherAfterComputationError(node);
    throw error;
  }

  if (node.compute === undefined) {
    node.payload = undefined;
    node.state &= ~WATCHER_TRANSIENT_STATE;
    return;
  }

  const hasCleanup = typeof result === "function";

  if (hasCleanup) {
    node.payload = result;
  }

  if ((node.state & Visited) === 0) {
    node.state &= ~DIRTY_STATE;
  } else {
    node.state = (node.state & ~Changed) | Unknown;
  }

  devRecordWatcherFinish(node, hasCleanup, result, defaultContext);
}

export function disposeWatcher(node: WatcherNode): void {
  devAssertNoRuntimeHookTopologyMutation();

  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.watcher.dispose");

  const payload = node.payload;
  const cleanup = typeof payload === "function" ? payload : null;

  disposeNode(node);
  node.state &= ~WATCHER_TRANSIENT_STATE;

  if (cleanup !== null) {
    runCleanup(cleanup);
  }

  node.payload = undefined;

  devRecordWatcherDispose(node, cleanup !== null, defaultContext);
}
