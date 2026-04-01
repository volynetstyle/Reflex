// ─── refreshDependency ────────────────────────────────────────────────────────
//
// Split into two functions to keep each call site monomorphic and small enough
// for JIT inlining:
//
//  refreshProducer  — only Producer nodes, no recompute, no propagate
//  refreshRecompute  — only Consumer nodes, calls recompute + maybe propagateOnce
//
// Why split vs one function with a branch?
//
//  A single refreshDependency(link, node, context, state) had 5 call sites
//  receiving both Producer and Consumer nodes → polymorphic dispatch on every
//  call → TurboFan/Ion/DFG back off from inlining after 4+ distinct receiver
//  shapes. Two dedicated functions keep each call site strictly monomorphic.
//
//  Size budget: each fits in ~10 AST nodes → all three JITs will inline them.

import type { ExecutionContext } from "../context";
import { recompute } from "../engine";
import type { ReactiveNode, ReactiveEdge } from "../shape";
import { DIRTY_STATE, ReactiveNodeState } from "../shape";
import { propagateOnce } from "./propagate.once";

/** Refresh a Producer node. Returns true if its value changed. */
export function refreshProducer(node: ReactiveNode, state: number): boolean {
  node.state = state & ~DIRTY_STATE;
  return (state & ReactiveNodeState.Changed) !== 0;
}

/**
 * Refresh a Computed node and propagate sideways if it has fanout.
 * Returns true if its value changed.
 */
export function refreshRecompute(
  link: ReactiveEdge,
  node: ReactiveNode,
  context: ExecutionContext,
): boolean {
  const changed = recompute(node, context);
  // Fanout check: if this node has siblings (prevOut or nextOut),
  // push the change sideways so they don't read a stale value on pull.
  if (changed && (link.prevOut !== null || link.nextOut !== null)) {
    propagateOnce(node, context);
  }
  return changed;
}
