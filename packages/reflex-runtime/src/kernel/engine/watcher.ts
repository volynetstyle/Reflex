import { defaultContext } from "@runtime/kernel/config";
import { currentConsumer, setCurrentConsumer } from "@runtime/kernel/state";
import {
  devRecordWatcherCleanup,
  devRecordWatcherDispose,
  devRecordWatcherFinish,
  devRecordWatcherSkip,
  devRecordWatcherStart,
} from "@runtime/kernel/dev";
import {
  devAssertNoRuntimeHookWatcherExecution,
  enterRuntimePhase,
  leaveRuntimePhase,
  RuntimePhase,
} from "@runtime/kernel/execution";
import {
  DIRTY_STATE,
  disposeNode,
  Changed,
  Invalid,
  Visited,
  type WatcherCleanup,
  type WatcherNode,
} from "@runtime/kernel/shape";
import { pull_iterator } from "@runtime/kernel/stages/second/pull_iterator";
import { profileRuntimeCounter } from "@runtime/profiling";

import { executeKnownNodeComputation } from "./watcher.execution";

const FORCE_STABILIZATION_STATE = Changed | Visited;

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
  if (!__DEV__) {
    runWatcherCore(node);
    return;
  }

  devAssertNoRuntimeHookWatcherExecution();
  enterRuntimePhase(RuntimePhase.WatcherExecution);
  try {
    runWatcherCore(node);
  } finally {
    leaveRuntimePhase();
  }
}

function runWatcherCore(node: WatcherNode): void {
  profileRuntimeCounter("watcherRunCalls");

  const state = node.state;

  if ((state & DIRTY_STATE) === 0) {
    profileRuntimeCounter("watcherCleanSkips");

    if (__DEV__) devRecordWatcherSkip(node, "clean", defaultContext);
    return;
  }

  if ((state & FORCE_STABILIZATION_STATE) === 0) {
    const edge = node.firstIn;

    if (edge === null || !pull_iterator(node, edge)) {
      profileRuntimeCounter("watcherStableSkips");

      node.state &= ~DIRTY_STATE;
      if (__DEV__) devRecordWatcherSkip(node, "stable", defaultContext);
      return;
    }
  }

  if (node.compute === undefined) {
    profileRuntimeCounter("watcherDisposedSkips");

    node.state &= ~DIRTY_STATE;
    if (__DEV__) devRecordWatcherSkip(node, "stable", defaultContext);
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
    runCleanup(prevCleanup);
    if (__DEV__) devRecordWatcherCleanup(node, defaultContext);

    if (node.compute === undefined) {
      node.state &= ~DIRTY_STATE;
      if (__DEV__) {
        devRecordWatcherFinish(node, false, undefined, defaultContext);
      }
      return;
    }
  }

  const result = executeKnownNodeComputation(node, compute);

  const hasCleanup = typeof result === "function";

  if (hasCleanup) {
    node.payload = result;
  }

  if ((node.state & Visited) === 0) {
    node.state &= ~DIRTY_STATE;
  } else {
    node.state = (node.state & ~Changed) | Invalid;
  }

  if (__DEV__) devRecordWatcherFinish(node, hasCleanup, result, defaultContext);
}

export function disposeWatcher(node: WatcherNode): void {
  profileRuntimeCounter("watcherDisposals");

  const payload = node.payload;
  const cleanup = typeof payload === "function" ? payload : null;

  disposeNode(node);

  if (cleanup !== null) {
    runCleanup(cleanup);
  }

  node.payload = undefined;

  if (__DEV__) devRecordWatcherDispose(node, cleanup !== null, defaultContext);
}
