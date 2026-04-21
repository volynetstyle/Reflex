import { shouldRecomputeDirtyWatcher } from "../walkers/recompute";
import type { ReactiveNode } from "../shape";
import {
  clearNodeVisited,
  DIRTY_STATE,
  clearDirtyState,
  disposeNode,
  Changed,
  Disposed,
  Invalid,
  Reentrant,
} from "../shape";
import { executeNodeComputation } from "./execute";
import { defaultContext } from "../context";
import { recordDebugEvent } from "../../debug/debug.impl";

function recordWatcherSkip(
  node: ReactiveNode,
  reason: "disposed" | "clean" | "stable",
): void {
  if (__DEV__) {
    recordDebugEvent(defaultContext, "watcher:run:skip", {
      node,
      detail: { reason },
    });
  }
}

function recordWatcherStart(node: ReactiveNode, hadCleanup: boolean): void {
  if (__DEV__) {
    recordDebugEvent(defaultContext, "watcher:run:start", {
      node,
      detail: { hadCleanup },
    });
  }
}

function recordWatcherCleanup(node: ReactiveNode): void {
  if (__DEV__) {
    recordDebugEvent(defaultContext, "watcher:cleanup", { node });
  }
}

function recordWatcherFinish(
  node: ReactiveNode,
  hasCleanup: boolean,
  result: unknown,
): void {
  if (__DEV__) {
    recordDebugEvent(defaultContext, "watcher:run:finish", {
      node,
      detail: {
        hasCleanup,
        result,
      },
    });
  }
}

function getWatcherCleanup(payload: unknown): (() => void) | null {
  return typeof payload === "function" ? (payload as () => void) : null;
}

export function runWatcher(node: ReactiveNode): void {
  const state = node.state;

  if ((state & Disposed) !== 0) {
    if (__DEV__) recordWatcherSkip(node, "disposed");
    return;
  }

  if ((state & DIRTY_STATE) === 0) {
    if (__DEV__) recordWatcherSkip(node, "clean");
    return;
  }

  if (!shouldRecomputeDirtyWatcher(node, state)) {
    clearDirtyState(node);
    if (__DEV__) recordWatcherSkip(node, "stable");
    return;
  }

  const prevCleanup = getWatcherCleanup(node.payload);
  if (__DEV__) recordWatcherStart(node, prevCleanup !== null);

  node.payload = undefined;
  clearNodeVisited(node);

  if (prevCleanup !== null) {
    prevCleanup();
    if (__DEV__) recordWatcherCleanup(node);
  }

  if ((node.state & Disposed) !== 0) {
    if (__DEV__) recordWatcherFinish(node, false, undefined);
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
    node.state =
      (node.state & ~Changed) | Invalid;
  }

  if (__DEV__) recordWatcherFinish(node, hasCleanup, result);
}

export function disposeWatcher(node: ReactiveNode): void {
  const cleanup = getWatcherCleanup(node.payload);
  disposeNode(node);
  if (cleanup !== null) cleanup();
  node.payload = undefined;

  if (__DEV__) {
    recordDebugEvent(defaultContext, "watcher:dispose", {
      node,
      detail: {
        hadCleanup: cleanup !== null,
      },
    });
  }
}
