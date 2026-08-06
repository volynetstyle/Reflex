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
import { profileRuntimeCounter } from "@runtime/profiling";

import { executeKnownNodeComputation } from "./watcher.execution";

const FORCE_STABILIZATION_STATE = Changed | Visited;
const WATCHER_TRANSIENT_STATE =
  DIRTY_STATE | Visited | Computing | Scheduled;

function recoverWatcherAfterError(node: WatcherNode): void {
  // A failed lifecycle callback must not leave an unscheduled dirty watcher:
  // such a node can no longer be invalidated and becomes a zombie. Keep its
  // dependency set as a conservative retry set, but return it to an idle
  // state so the next source change can schedule it again.
  node.state &= ~WATCHER_TRANSIENT_STATE;
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
  profileRuntimeCounter("watcherCleanups");

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
  profileRuntimeCounter("watcherRunCalls");

  const state = node.state;

  if ((state & DIRTY_STATE) === 0) {
    profileRuntimeCounter("watcherCleanSkips");

    devRecordWatcherSkip(node, "clean", defaultContext);
    return;
  }

  if ((state & FORCE_STABILIZATION_STATE) === 0) {
    const edge = node.firstIn;

    if (edge === null || !pull_iterator(node, edge)) {
      profileRuntimeCounter("watcherStableSkips");

      node.state &= ~DIRTY_STATE;
      devRecordWatcherSkip(node, "stable", defaultContext);
      return;
    }
  }

  if (node.compute === undefined) {
    profileRuntimeCounter("watcherDisposedSkips");

    node.state &= ~DIRTY_STATE;
      devRecordWatcherSkip(node, "stable", defaultContext);
    return;
  }

  const compute = node.compute;
  profileRuntimeCounter("watcherExecutions");

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
    recoverWatcherAfterError(node);
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

  profileRuntimeCounter("watcherDisposals");

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
