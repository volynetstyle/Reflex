// ─── pullAndRecompute ─────────────────────────────────────────────────────────
//
// Replaces recuperate + phase-3 of readConsumer.
//
// Phase 1 (pull/mark): DFS upward via firstIn, collecting all STALE computed
//   nodes into toRecompute in traversal order (depth-first).
//   - Obsolete → add, do NOT go further up (definitely dirty)
//   - Invalid  → add, go further up (need to check sources)
//   - Valid    → stop (clean by invariant)
//
// Phase 2 (recompute): iterate toRecompute in reverse order
//   (sources before consumers — correct topological order).
//   Each node is recomputed only if it is still STALE after its
//   dependencies have already been recomputed earlier in the stack.
//
// This implements SAC read/noch.: if all sources of a node turn out clean
// after recomputation, clearPropagate removes STALE without calling compute.
//
// FIX #1: Visited bits were only cleared for nodes in toRecompute.
//   Nodes that were traversed in phase 1 but were already clean (STALE=false)
//   kept Visited=1, causing subsequent pulls to silently skip them.
//   Fix: track *every* visited node in a separate `visited` array and clear
//   all of them at the end of phase 2, unconditionally.
//
// FIX #5: stats.recuperateCalls was declared but never incremented.
//   Fix: increment at the top of pullAndRecompute.

import recompute from "../consumer/recompute";
import { ReactiveNode, ReactiveNodeState } from "../shape";
import { propagate } from "./propagate";
import { clearPropagate } from "./propagateFrontier";

const STALE = ReactiveNodeState.Invalid | ReactiveNodeState.Obsolete;

export function pullAndRecompute(node: ReactiveNode): void {
  // FIX #1: track every node touched in phase 1 so we can clear Visited later
  const visited: ReactiveNode[] = [];

  // Phase 1: upward traversal, collecting in topological order
  const toRecompute: ReactiveNode[] = [];
  const stack: ReactiveNode[] = [node];

  while (stack.length) {
    const n = stack.pop()!;
    const s = n.runtime;

    if (s & ReactiveNodeState.Visited) {
      continue;
    }
    
    n.runtime = s | ReactiveNodeState.Visited;

    // FIX #1: record every visited node, not just those in toRecompute
    visited.push(n);

    if (!(s & STALE)) {
      continue;
    } // Valid — stop, ancestors are also clean

    if (n.compute) {
      toRecompute.push(n);
    } // only recompute computed nodes

    if (s & ReactiveNodeState.Obsolete) {
      continue;
    } // definitely dirty — no need to go further up

    // Invalid — go up to check sources
    for (let e = n.firstIn; e; e = e.nextIn) {
      if (!(e.from.runtime & ReactiveNodeState.Visited)) {
        stack.push(e.from);
      }
    }
  }

  // Phase 2: recompute in reverse topological order (leaves first)
  for (let i = toRecompute.length - 1; i >= 0; i--) {
    const n = toRecompute[i]!;

    // If a dependency above already cleaned this node via clearPropagate — skip
    if (!(n.runtime & STALE)) {
      continue;
    }

    if (recompute(n)) {
      propagate(n, true); // value changed → mark children Obsolete
    } else {
      clearPropagate(n); // same value → clear STALE downward
    }
  }

  // FIX #1: clear Visited on ALL nodes touched during phase 1, not just toRecompute
  for (const n of visited) {
    n.runtime &= ~ReactiveNodeState.Visited;
  }
}
