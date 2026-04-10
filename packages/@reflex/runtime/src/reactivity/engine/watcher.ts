import { recordDebugEvent } from "../../debug";
import {
  shouldRecomputeDirtyWatcher,
} from "../walkers/recompute";
import type { ReactiveNode } from "../shape";
import {
  clearNodeVisited,
  DIRTY_STATE,
  ReactiveNodeState,
  UNINITIALIZED,
  clearDirtyState,
  disposeNode,
} from "../shape";
import { executeNodeComputation } from "./execute";
import { defaultContext } from "../context";

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

  if ((state & ReactiveNodeState.Disposed) !== 0) {
    recordWatcherSkip(node, "disposed");
    return;
  }

  if ((state & DIRTY_STATE) === 0) {
    recordWatcherSkip(node, "clean");
    return;
  }

  if (!shouldRecomputeDirtyWatcher(node, state)) {
    clearDirtyState(node);
    recordWatcherSkip(node, "stable");
    return;
  }

  const prevCleanup = getWatcherCleanup(node.payload);
  recordWatcherStart(node, prevCleanup !== null);

  node.payload = UNINITIALIZED;
  clearNodeVisited(node);

  if (prevCleanup !== null) {
    prevCleanup();
    recordWatcherCleanup(node);
  }

  if ((node.state & ReactiveNodeState.Disposed) !== 0) {
    if (__DEV__) recordWatcherFinish(node, false, UNINITIALIZED);
    return;
  }

  const result = executeNodeComputation(node);
  const hasCleanup = typeof result === "function";

  if (hasCleanup) {
    node.payload = result as () => void;
  }

  if ((node.state & ReactiveNodeState.Visited) === 0) {
    clearDirtyState(node);
  } else {
    node.state =
      (node.state & ~ReactiveNodeState.Changed) | ReactiveNodeState.Invalid;
  }

  if (__DEV__) {
    recordWatcherFinish(node, hasCleanup, result);
  }
}

export function disposeWatcher(node: ReactiveNode): void {
  const cleanup = getWatcherCleanup(node.payload);
  disposeNode(node);
  if (cleanup !== null) cleanup();
  node.payload = UNINITIALIZED;

  if (__DEV__) {
    recordDebugEvent(defaultContext, "watcher:dispose", {
      node,
      detail: {
        hadCleanup: cleanup !== null,
      },
    });
  }
}
