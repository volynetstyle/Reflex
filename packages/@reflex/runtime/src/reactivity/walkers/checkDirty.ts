import runtime from "../../runtime";
import { recompute } from "../engine/compute";
import { updateSignal } from "../engine/updateSignal";
import {
  CHANGED_STATE,
  DIRTY_STATE,
  MAYBE_CHANGE_STATE,
  type ReactiveEdge,
  ReactiveNode,
  ReactiveNodeKind,
} from "../shape";
import { shallowPropagate } from "./propagate";

function updateDirtySource(node: ReactiveNode): boolean {
  if (node.kind === ReactiveNodeKind.Signal) {
    return updateSignal(node);
  }

  return recompute(node);
}

/**
 * Pull-side depth-first walk over incoming dependencies.
 * The walk refreshes only the branches that are already marked pending/changed
 * and exits early as soon as one source proves the current node stale.
 */
export function checkDirty(node: ReactiveNode): boolean {
  if (node.kind === ReactiveNodeKind.Signal) {
    return false;
  }

  if ((node.state & CHANGED_STATE) !== 0) {
    return true;
  }

  const firstLink = node.firstIn;
  if (firstLink === null) {
    node.state &= ~MAYBE_CHANGE_STATE;
    return false;
  }

  let link: ReactiveEdge = firstLink;
  const stack = runtime.edgeStack;
  const stackBase = stack.length;
  let sp = stackBase;
  let sub = node;
  let checkDepth = 0;
  let dirty = false;

  top: do {
    const dep = link.from;
    const depState = dep.state;

    if ((sub.state & CHANGED_STATE) !== 0) {
      dirty = true;
    } else if ((depState & CHANGED_STATE) !== 0) {
      if (updateDirtySource(dep)) {
        if (dep.kind !== ReactiveNodeKind.Signal) {
          const subs = dep.firstOut!;
          if (subs.nextOut !== null) {
            shallowPropagate(dep);
          }
        }
        dirty = true;
      } else {
        dep.state &= ~DIRTY_STATE;
      }
    } else if (
      dep.kind !== ReactiveNodeKind.Signal &&
      (depState & MAYBE_CHANGE_STATE) !== 0
    ) {
      if (link.nextOut !== null || link.prevOut !== null) {
        stack[sp++] = link;
      }
      link = dep.firstIn!;
      sub = dep;
      ++checkDepth;
      continue;
    }

    if (!dirty) {
      const nextDep = link.nextIn;
      if (nextDep !== null) {
        link = nextDep;
        continue;
      }
    }

    while (checkDepth) {
      --checkDepth;

      const firstSub = sub.firstOut!;
      const hasMultipleSubs = firstSub.nextOut !== null;
      link = hasMultipleSubs ? stack[--sp]! : firstSub;

      if (dirty) {
        if (updateDirtySource(sub)) {
          if (hasMultipleSubs) {
            shallowPropagate(sub);
          }
          sub = link.to;
          continue;
        }
        dirty = false;
      } else {
        sub.state &= ~MAYBE_CHANGE_STATE;
      }

      sub = link.to;
      const nextDep = link.nextIn;
      if (nextDep !== null) {
        link = nextDep;
        continue top;
      }
    }

    return dirty;
  } while (true);
}
