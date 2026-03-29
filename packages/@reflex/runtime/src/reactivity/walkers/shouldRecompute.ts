import { recompute } from "../engine/compute";
import { getDefaultContext } from "../context";
import type { ReactiveNode } from "../shape";
import { DIRTY_STATE, type ReactiveEdge, ReactiveNodeState } from "../shape";
import { propagateOnce } from "./propagate";

// Fanout matters only when the dependency has multiple subscribers. In that
// case a confirmed change must eagerly promote other invalid subscribers too.
//
// Example — no fanout (single subscriber, skip propagateOnce):
//   A ──► B   (B.prevOut === null, B.nextOut === null)
//
// Example — fanout (multiple subscribers, propagateOnce needed):
//   A ──► B
//   A ──► C   (the edge A→B has nextOut pointing to A→C)
function hasFanout(link: ReactiveEdge): boolean {
  return link.prevOut !== null || link.nextOut !== null;
}

// Refresh a single dependency node and return whether its value changed.
//
// Two cases:
//
//  1. Producer (e.g. a writable signal): value was already committed on write,
//     so we just read the Changed flag and clear dirty state. No recompute needed.
//
//     signal.set(42)
//       └─ marks Changed, sets dirty bits
//     refreshDependency(link, signal)
//       └─ reads Changed=true, clears bits, returns true
//
//  2. Computed node: recompute() reruns the user function. If the result
//     changed AND the node has multiple subscribers, push the change sideways
//     via propagateOnce so sibling consumers don't miss it.
//
//     computed C depends on signal A and signal B.
//     Only A changed → recompute(C) runs → new value differs → changed=true.
//     If D and E both depend on C → hasFanout=true → propagateOnce(C)
//     marks D and E invalid immediately (push side) so they don't pull stale.
function refreshDependencyNoFanout(node: ReactiveNode, state: number): boolean {
  if ((state & ReactiveNodeState.Producer) !== 0) {
    node.state = state & ~DIRTY_STATE;
    return (state & ReactiveNodeState.Changed) !== 0;
  }

  return recompute(node, getDefaultContext());
}

function refreshDependency(
  link: ReactiveEdge,
  node: ReactiveNode,
  state = node.state,
): boolean {
  const changed = refreshDependencyNoFanout(node, state);
  if (changed && hasFanout(link)) propagateOnce(node, getDefaultContext());
  return changed;
}

function clearInvalid(node: ReactiveNode): void {
  node.state &= ~ReactiveNodeState.Invalid;
}

function shouldRecomputeBranching(
  link: ReactiveEdge,
  consumer: ReactiveNode,
  stack: ReactiveEdge[],
  stackTop: number,
): boolean {
  let changed = false;

  // Stack entries remember which parent edge should be refreshed after the
  // current dependency subtree finishes resolving.
  outer: while (true) {
    const dep = link.from;
    const depState = dep.state;

    if ((consumer.state & ReactiveNodeState.Changed) !== 0) {
      changed = true;
    } else if ((depState & ReactiveNodeState.Changed) !== 0) {
      changed = refreshDependency(link, dep, depState);
    } else if (
      (depState & ReactiveNodeState.Producer) === 0 &&
      (depState & DIRTY_STATE) !== 0
    ) {
      const deps = dep.firstIn;
      if (deps !== null) {
        stackTop += 1;
        stack[stackTop] = link;
        link = deps;
        consumer = dep;
        continue;
      }

      changed = refreshDependency(link, dep, depState);
    }

    if (!changed) {
      const next = link.nextIn;
      if (next !== null) {
        link = next;
        continue;
      }

      clearInvalid(consumer);
    }

    while (stackTop >= 0) {
      const parentLink = stack[stackTop]!;
      stackTop -= 1;

      if (changed) {
        changed = refreshDependency(parentLink, consumer);
      } else {
        clearInvalid(consumer);
      }

      consumer = parentLink.to;

      if (!changed) {
        const next = parentLink.nextIn;
        if (next !== null) {
          link = next;
          continue outer;
        }
      }
    }

    return changed;
  }
}

function shouldRecomputeLinear(
  node: ReactiveNode,
  firstIn: ReactiveEdge,
): boolean {
  const stack: ReactiveEdge[] = [];
  let stackTop = -1;
  let link = firstIn;
  let consumer = node;
  let changed = false;

  while (true) {
    if (link.nextIn !== null) {
      return shouldRecomputeBranching(link, consumer, stack, stackTop);
    }

    if ((consumer.state & ReactiveNodeState.Changed) !== 0) {
      changed = true;
      break;
    }

    const dep = link.from;
    const depState = dep.state;

    if ((depState & ReactiveNodeState.Changed) !== 0) {
      changed = refreshDependency(link, dep, depState);
      break;
    }

    if (
      (depState & ReactiveNodeState.Producer) === 0 &&
      (depState & DIRTY_STATE) !== 0
    ) {
      const deps = dep.firstIn;
      if (deps !== null) {
        if (deps.nextIn !== null) {
          stackTop += 1;
          stack[stackTop] = link;
          return shouldRecomputeBranching(deps, dep, stack, stackTop);
        }

        stackTop += 1;
        stack[stackTop] = link;
        link = deps;
        consumer = dep;
        continue;
      }

      changed = refreshDependency(link, dep, depState);
      break;
    }

    clearInvalid(consumer);

    if (stackTop < 0) return false;

    link = stack[stackTop]!;
    stackTop -= 1;
    consumer = link.to;
  }

  while (stackTop >= 0) {
    const parentLink = stack[stackTop]!;
    stackTop -= 1;

    if (changed) {
      changed = refreshDependency(parentLink, consumer);
    } else {
      clearInvalid(consumer);
    }

    consumer = parentLink.to;
  }

  if (!changed) clearInvalid(consumer);
  return changed;
}

/**
 * Pull-side depth-first walk over incoming dependencies.
 * Stays on the cheap linear path while there are no dirty branches,
 * and escalates to stack-backed DFS only when descent is needed.
 *
 * Called when a computed node is about to re-execute and needs to know
 * whether any upstream value actually changed, or whether the dirty flag
 * was a false alarm (e.g. a signal was set to the same value).
 *
 * Dependency graph terminology used in comments below:
 *
 *   "dep"  — an upstream node that `sub` reads from
 *   "sub"  — the consumer currently being inspected (starts as `node`)
 *   "link" — the ReactiveEdge connecting dep → sub
 *
 * Example graph (all arrows = "depends on"):
 *
 *         A (signal, Changed)
 *         │
 *         B (computed, Invalid)   ← node passed in
 *        / \
 *       C   D (both computed, Invalid)
 *
 * Walk order: B→C first (linear), then B→D, descend into each if dirty.
 *
 * Return value:
 *   true  → at least one upstream value changed; caller should recompute node.
 *   false → all dirty flags were stale; node value is still valid.
 */
export function shouldRecompute(node: ReactiveNode): boolean {
  const state = node.state;

  // Producers commit eagerly on write; pull-side walk is never needed for them.
  if ((state & ReactiveNodeState.Producer) !== 0) return false;

  // Already confirmed changed upstream (e.g. by push-side propagate) — no walk needed.
  if ((state & ReactiveNodeState.Changed) !== 0) return true;
  // If a tracked dependency invalidated this node while it was computing,
  // propagate() leaves Visited|Invalid behind as the re-entrancy marker.
  // That means the current execution observed a stale prefix and must rerun.
  if (
    (state & ReactiveNodeState.Invalid) !== 0 &&
    (state & ReactiveNodeState.Visited) !== 0
  ) {
    return true;
  }

  const firstIn = node.firstIn;
  if (firstIn === null) {
    // No dependencies at all: nothing could have changed.
    // Clear Invalid so the node is treated as stable until next write.
    node.state = state & ~ReactiveNodeState.Invalid;
    return false;
  }

  return shouldRecomputeLinear(node, firstIn);
}
