import type { ReactiveNode } from "../reactivity/shape";
import { recordDebugEvent } from "../debug";
import {
  clearNodeVisited,
  DIRTY_STATE,
  ReactiveNodeState,
  UNINITIALIZED,
  clearDirtyState,
  disposeNode,
} from "../reactivity/shape";
import { executeNodeComputation } from "../reactivity/engine/execute";
import { shouldRecompute } from "../reactivity";
import { getDefaultContext } from "../reactivity/context";

export function runWatcher(node: ReactiveNode): void {
  const state = node.state;
  const context = getDefaultContext();
  
  if ((state & ReactiveNodeState.Disposed) !== 0) {
    if (__DEV__) {
      recordDebugEvent(context, "watcher:run:skip", {
        node,
        detail: { reason: "disposed" },
      });
    }
    return;
  }

  const dirty = (state & DIRTY_STATE) !== 0;
  if (!dirty) {
    if (__DEV__) {
      recordDebugEvent(context, "watcher:run:skip", {
        node,
        detail: { reason: "clean" },
      });
    }
    return;
  }

  const changed = (state & ReactiveNodeState.Changed) !== 0;
  if (!changed && !shouldRecompute(node)) {
    clearDirtyState(node);

    if (__DEV__) {
      recordDebugEvent(context, "watcher:run:skip", {
        node,
        detail: { reason: "stable" },
      });
    }
    return;
  }

  const payload = node.payload;
  const prevCleanup =
    typeof payload === "function" ? (payload as () => void) : null;

  if (__DEV__) {
    recordDebugEvent(context, "watcher:run:start", {
      node,
      detail: { hadCleanup: prevCleanup !== null },
    });
  }

  node.payload = UNINITIALIZED;
  clearNodeVisited(node);
  clearDirtyState(node);

  prevCleanup?.();

  if (__DEV__ && prevCleanup !== null) {
    recordDebugEvent(context, "watcher:cleanup", { node });
  }

  if ((node.state & ReactiveNodeState.Disposed) !== 0) {
    return;
  }

  let finalResult: unknown = UNINITIALIZED;
  let hasCleanup = false;

  executeNodeComputation(
    node,
    (result: unknown) => {
      if ((node.state & ReactiveNodeState.Disposed) !== 0) {
        return;
      }

      finalResult = result;

      if (typeof result === "function") {
        hasCleanup = true;
        node.payload = result as () => void;
      }
    },
    context,
  );

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
  const payload = node.payload;
  const cleanup =
    typeof payload === "function" ? (payload as () => void) : null;
  const hadCleanup = cleanup !== null;

  disposeNode(node);

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
