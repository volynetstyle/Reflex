import { recompute } from "../engine/compute";
import {
  DIRTY_STATE,
  clearDirtyState,
  type ReactiveEdge,
  ReactiveNode,
  ReactiveNodeState,
} from "../shape";
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
function refreshDependency(link: ReactiveEdge, node: ReactiveNode): boolean {
  if ((node.state & ReactiveNodeState.Producer) !== 0) {
    const changed = (node.state & ReactiveNodeState.Changed) !== 0;
    clearDirtyState(node);
    return changed;
  }

  const changed = recompute(node);
  if (changed && hasFanout(link)) propagateOnce(node);
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

  const firstIn = node.firstIn;
  if (firstIn === null) {
    // No dependencies at all: nothing could have changed.
    // Clear Invalid so the node is treated as stable until next write.
    node.state = state & ~ReactiveNodeState.Invalid;
    return false;
  }

  // Stack stores return points for the DFS.
  // Each entry is the edge we descended through; on the way back up
  // we use it to resume the parent consumer's remaining siblings.
  //
  // Example — descending into C (dep of B):
  //   stack: [ edge(B→C) ]
  //   After C's subtree resolves, pop → resume B's next dep (B→D).
  const stack: ReactiveEdge[] = [];
  let stackTop = -1;

  let link = firstIn; // current edge being inspected
  let sub = node;     // consumer whose incoming edges we are walking
  let dirty = false;  // true once any upstream change is confirmed

  outer: while (true) {
    const dep = link.from;
    const depState = dep.state;

    if ((sub.state & ReactiveNodeState.Changed) !== 0) {
      // sub itself was confirmed changed while we were descending into it
      // (e.g. propagateOnce ran concurrently from a fanout sibling).
      // No need to inspect further deps of sub — just mark dirty and unwind.
      dirty = true;
    } else if ((depState & ReactiveNodeState.Changed) !== 0) {
      // dep is already confirmed changed (producer or previously refreshed computed).
      // Refresh it (clears dirty bits, may propagate to fanout siblings)
      // and record whether its value actually differs.
      //
      // Example: signal A was set to a new value → A.Changed=true
      //   refreshDependency returns true → dirty=true → unwind and return true.
      dirty = refreshDependency(link, dep) || dirty;
    } else if (
      (depState & ReactiveNodeState.Producer) === 0 &&
      (depState & DIRTY_STATE) !== 0 &&
      dep.firstIn !== null
    ) {
      // dep is a dirty computed node with its own dependencies.
      // We can't know if it truly changed without inspecting its subtree first.
      // Descend: push current position as a return point and move into dep.
      //
      // Example: B depends on C (computed, Invalid), C depends on A (signal).
      //   We don't know if C changed until we check A.
      //   Push edge(B→C), set link=C.firstIn, sub=C, then loop again.
      stack[++stackTop] = link;
      link = dep.firstIn;
      sub = dep;
      continue;
    } else if (
      (depState & ReactiveNodeState.Producer) === 0 &&
      (depState & DIRTY_STATE) !== 0
      // dep.firstIn === null implied here (previous branch took dep.firstIn !== null)
    ) {
      // dep is a dirty computed node with no current dependencies.
      // It lost all its deps (e.g. conditional branch stopped tracking them).
      // Must rerun once to refresh its value even though there's nothing to descend into.
      dirty = refreshDependency(link, dep) || dirty;
    }
    // else: dep is clean (not dirty, not changed) — nothing to do, keep walking siblings.

    // ── Advance or begin unwinding ────────────────────────────────────────────

    if (!dirty) {
      // Still no confirmed change. Try next sibling dep of the current consumer.
      //
      // Example: sub=B, checked dep C (clean), now check dep D.
      //   link = link.nextIn → edge(B→D), continue outer loop.
      if (link.nextIn !== null) {
        link = link.nextIn;
        continue;
      }

      // All deps of sub checked out clean → sub is no longer invalid.
      sub.state &= ~ReactiveNodeState.Invalid;
    }

    // ── Unwind DFS stack ──────────────────────────────────────────────────────
    //
    // Either dirty=true (change confirmed, propagate up) or we exhausted sub's
    // deps cleanly and need to return to the parent consumer.
    //
    // Example unwind (dirty=true):
    //   stack: [ edge(B→C) ]  sub=C  dirty=true
    //   Pop edge(B→C): refreshDependency(edge(B→C), C)
    //     → reruns C, returns whether C's value changed
    //     → dirty = that result (C might have re-computed to same value → false)
    //   sub = B, link = edge(B→C)
    //   dirty=false now? check B's next dep (B→D) before returning.
    //
    // Example unwind (dirty=false):
    //   stack: [ edge(B→C) ]  sub=C  dirty=false
    //   Pop edge(B→C): clear C's Invalid flag, keep dirty=false.
    //   sub = B, link = edge(B→C)
    //   Check B's next dep (B→D).
    while (stackTop >= 0) {
      const parentLink = stack[stackTop--]!;

      dirty = dirty
        ? refreshDependency(parentLink, sub)
        : (sub.state &= ~ReactiveNodeState.Invalid, false);

      sub = parentLink.to;
      link = parentLink;

      if (!dirty && link.nextIn !== null) {
        // Parent is still clean and has more deps to inspect.
        // Resume the outer loop at the next sibling rather than unwinding further.
        link = link.nextIn;
        continue outer;
      }
    }

    // Stack fully unwound. dirty reflects whether the original node's
    // dependency subtree contained any real change.
    return dirty;
  }
}