import type { ReactiveNode } from "../shape";
import {
  clearNodeVisited,
  DIRTY_STATE,
  clearDirtyState,
  disposeNode,
  Changed,
  Invalid,
  Visited,
} from "../shape";
import { pull_iterator } from "../stages/second/pull_iterator";
import { executeKnownNodeComputation } from "./watcher.execution";
import {
  currentConsumer,
  defaultContext,
  setCurrentConsumer,
} from "../context";
import {
  devRecordWatcherCleanup,
  devRecordWatcherDispose,
  devRecordWatcherFinish,
  devRecordWatcherSkip,
  devRecordWatcherStart,
} from "../dev";

type WatcherCleanup = () => void;
const FORCE_RECOMPUTE_STATE = Changed | Visited;

function runCleanup(cleanup: WatcherCleanup): void {
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

function shouldRunDirtyWatcher(
  node: ReactiveNode<WatcherCleanup | undefined>,
  state: number,
): boolean {
  if ((state & FORCE_RECOMPUTE_STATE) !== 0) return true;

  const edge = node.firstIn;
  return edge !== null && pull_iterator(node, edge);
}

export function runWatcher(
  node: ReactiveNode<WatcherCleanup | undefined>,
): void {
  const state = node.state;

  if ((state & DIRTY_STATE) === 0) {
    if (__DEV__) devRecordWatcherSkip(node, "clean", defaultContext);
    return;
  }

  if (!shouldRunDirtyWatcher(node, state)) {
    clearDirtyState(node);
    if (__DEV__) devRecordWatcherSkip(node, "stable", defaultContext);
    return;
  }

  const compute = node.compute;
  const prevPayload = node.payload;
  const prevCleanup = typeof prevPayload === "function" ? prevPayload : null;

  if (__DEV__)
    devRecordWatcherStart(node, prevCleanup !== null, defaultContext);

  node.payload = undefined;
  clearNodeVisited(node);

  if (prevCleanup !== null) {
    runCleanup(prevCleanup);
    if (__DEV__) devRecordWatcherCleanup(node, defaultContext);

    if (node.compute === null) {
      clearDirtyState(node);
      if (__DEV__) {
        devRecordWatcherFinish(node, false, undefined, defaultContext);
      }
      return;
    }
  }

  const result = executeKnownNodeComputation(node, compute);

  const hasCleanup = typeof result === "function";

  if (hasCleanup) {
    node.payload = result as WatcherCleanup;
  }

  if ((node.state & Visited) === 0) {
    clearDirtyState(node);
  } else {
    node.state = (node.state & ~Changed) | Invalid;
  }

  if (__DEV__) devRecordWatcherFinish(node, hasCleanup, result, defaultContext);
}

export function disposeWatcher(node: ReactiveNode): void {
  const payload = node.payload;
  const cleanup =
    typeof payload === "function" ? (payload as WatcherCleanup) : null;

  disposeNode(node);

  if (cleanup !== null) {
    runCleanup(cleanup);
  }

  node.payload = undefined;

  if (__DEV__) devRecordWatcherDispose(node, cleanup !== null, defaultContext);
}
