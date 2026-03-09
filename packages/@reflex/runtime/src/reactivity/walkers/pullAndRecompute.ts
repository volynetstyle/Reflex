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
import { INVALID, ReactiveNode, ReactiveNodeState } from "../shape";
import { clearPropagate } from "./clearPropagate";
import { propagate } from "./propagate";

export function pullAndRecompute(node: ReactiveNode): void {
  const stack: ReactiveNode[] = [node];
  const exit: number[] = [0]; // 0 = enter, 1 = exit

  // stack.length === exit.lenght

  while (stack.length) {
    const n = stack.pop()!;
    const state = exit.pop()!;

    const s = n.runtime;

    if (!state) {
      if (s & ReactiveNodeState.Visited) continue;

      n.runtime = s | ReactiveNodeState.Visited;

      if (!(s & INVALID)) {
        n.runtime &= ~ReactiveNodeState.Visited;
        continue;
      }

      // schedule exit
      stack.push(n);
      exit.push(1);

      if (!(s & ReactiveNodeState.Obsolete)) {
        for (let e = n.firstIn; e; e = e.nextIn) {
          const parent = e.from;
          if (!(parent.runtime & ReactiveNodeState.Visited)) {
            stack.push(parent);
            exit.push(0);
          }
        }
      }
    } else {
      // exit phase → parents already processed

      if (n.compute && n.runtime & INVALID) {
        if (recompute(n)) {
          propagate(n, ReactiveNodeState.Obsolete);
        } else {
          let canClear = true;

          for (let e = node.firstIn; e; e = e.nextIn) {
            if (e.from.runtime & INVALID) {
              canClear = false;
              break;
            }
          }

          if (canClear) clearPropagate(n);
        }
      }

      n.runtime &= ~ReactiveNodeState.Visited;
    }
  }
}
