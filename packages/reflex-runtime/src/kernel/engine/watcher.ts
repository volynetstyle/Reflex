import { shouldRecomputeDirtyWatcher } from "../walkers/recomputeNode";
import type { ReactiveNode } from "../shape";
import {
  clearNodeVisited,
  DIRTY_STATE,
  clearDirtyState,
  disposeNode,
  Changed,
  Invalid,
  Reentrant,
} from "../shape";
import { executeNodeComputation } from "./executeWatcher";
import { activeConsumer, defaultContext, setActiveConsumer } from "../context";
import {
  devRecordWatcherCleanup,
  devRecordWatcherDispose,
  devRecordWatcherFinish,
  devRecordWatcherSkip,
  devRecordWatcherStart,
} from "../dev";

function getWatcherCleanup(payload: unknown): (() => void) | null {
  return typeof payload === "function" ? (payload as () => void) : null;
}

function runCleanup(cleanup: () => void): void {
  const prevActive = activeConsumer;
  setActiveConsumer(null);

  try {
    cleanup();
  } finally {
    setActiveConsumer(prevActive);
  }
}

export function runWatcher(node: ReactiveNode): void {
  const state = node.state;

  if ((state & DIRTY_STATE) === 0) {
    devRecordWatcherSkip(node, "clean", defaultContext);
    return;
  }

  if (!shouldRecomputeDirtyWatcher(node, state)) {
    clearDirtyState(node);
    devRecordWatcherSkip(node, "stable", defaultContext);
    return;
  }

  const prevCleanup = getWatcherCleanup(node.payload);
  devRecordWatcherStart(node, prevCleanup !== null, defaultContext);

  node.payload = undefined;
  clearNodeVisited(node);

  if (prevCleanup !== null) {
    runCleanup(prevCleanup);
    devRecordWatcherCleanup(node, defaultContext);
  }

  if (node.compute === null) {
    devRecordWatcherFinish(node, false, undefined, defaultContext);
    return;
  }

  const result = executeNodeComputation(node);
  const hasCleanup = typeof result === "function";

  if (hasCleanup) {
    node.payload = result as () => void;
  }

  if ((node.state & Reentrant) === 0) {
    clearDirtyState(node);
  } else {
    node.state = (node.state & ~Changed) | Invalid;
  }

  devRecordWatcherFinish(node, hasCleanup, result, defaultContext);
}

export function disposeWatcher(node: ReactiveNode): void {
  const cleanup = getWatcherCleanup(node.payload);
  disposeNode(node);
  if (cleanup !== null) runCleanup(cleanup);
  node.payload = undefined;

  devRecordWatcherDispose(node, cleanup !== null, defaultContext);
}
