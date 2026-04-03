// ─── refreshDependency ────────────────────────────────────────────────────────
//
// Pull-walk only refreshes computed nodes. Producers commit on write and should
// never reach shouldRecompute() with dirty bits set, so this helper stays
// monomorphic and tiny enough for JIT inlining at every call site.

import type { ExecutionContext } from "../context";
import { recompute } from "../engine";
import type { ReactiveNode, ReactiveEdge } from "../shape";
import { propagateOnce } from "./propagate.once";

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
