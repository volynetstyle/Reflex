import type { ReactiveNode } from "../reactivity/shape";
import type { ExecutionContext } from "../reactivity/context";
import { recordDebugEvent } from "../debug";
import {
  beginNodeTracking,
  clearNodeTracking,
  clearNodeVisited,
  DIRTY_STATE,
  ReactiveNodeState,
  UNINITIALIZED,
  clearDirtyState,
} from "../reactivity/shape";
import { disposeNode } from "../reactivity/shape/methods/connect";
import { executeNodeComputation } from "../reactivity/engine/execute";
import { shouldRecompute } from "../reactivity/walkers/shouldRecompute";
import { getDefaultContext } from "../reactivity/context";

export function runWatcher(
  node: ReactiveNode,
  context: ExecutionContext = getDefaultContext(),
): void {
  const state = node.state;

  if ((state & ReactiveNodeState.Disposed) !== 0) {
    if (__DEV__) {
      recordDebugEvent(context, "watcher:run:skip", {
        node,
        detail: {
          reason: "disposed",
        },
      });
    }

    return;
  }

  const dirty = (state & DIRTY_STATE) !== 0;
  const needsRun = dirty && shouldRecompute(node);

  if (!needsRun) {
    clearDirtyState(node);

    if (__DEV__) {
      recordDebugEvent(context, "watcher:run:skip", {
        node,
        detail: {
          reason: dirty ? "stable" : "clean",
        },
      });
    }

    return;
  }

  const prevCleanup =
    typeof node.payload === "function" ? (node.payload as () => void) : null;

  if (__DEV__) {
    recordDebugEvent(context, "watcher:run:start", {
      node,
      detail: {
        hadCleanup: prevCleanup !== null,
      },
    });
  }

  node.payload = UNINITIALIZED;
  clearNodeVisited(node);
  clearDirtyState(node);
  prevCleanup?.();

  if (__DEV__ && prevCleanup !== null) {
    recordDebugEvent(context, "watcher:cleanup", {
      node,
    });
  }

  let finalResult: unknown = UNINITIALIZED;
  let hasCleanup = false;

  beginNodeTracking(node);

  try {
    executeNodeComputation(node, (result) => {
      finalResult = result;
      hasCleanup = typeof result === "function";
      if (hasCleanup) node.payload = result as () => void;
    }, context);
  } finally {
    clearNodeTracking(node);
  }

  if (__DEV__) {
    recordDebugEvent(context, "watcher:run:finish", {
      node,
      detail: {
        hasCleanup,
        result: finalResult,
      },
    });
  }
}

export function disposeWatcher(node: ReactiveNode): void {
  const hadCleanup = typeof node.payload === "function";

  disposeNode(node);

  const cleanup =
    typeof node.payload === "function" ? (node.payload as () => void) : null;
  cleanup?.();
  node.payload = UNINITIALIZED;

  if (__DEV__) {
    recordDebugEvent(getDefaultContext(), "watcher:dispose", {
      node,
      detail: {
        hadCleanup,
      },
    });
  }
}

export const recycling = runWatcher;
