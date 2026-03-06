import { ReactiveNode, ReactiveNodeState } from "../shape";

const STALE = ReactiveNodeState.Invalid | ReactiveNodeState.Obsolete;

// ─── clearPropagate ───────────────────────────────────────────────────────────
//
// FIX #3: The original code cleared both Invalid and Obsolete bits with `s & ~STALE`.
// This is too aggressive in diamond graphs: if a node is Invalid from *two* sources,
// one source's equality-bailout clear would incorrectly remove the other source's dirt.
//
// Fix: only clear Invalid, never clear Obsolete here.
// Obsolete nodes are only cleaned by recompute() itself (which produces a new value
// and then sets them clean), not by a sibling's bailout path.
//
// The existing `if (s & Obsolete) continue` guard was correct but insufficient on its
// own — we also must not touch the Obsolete bit on nodes we *do* descend into.

export function clearPropagate(node: ReactiveNode): void {
  const stack: ReactiveNode[] = [node];

  while (stack.length) {
    const n = stack.pop()!;

    for (let e = n.firstOut; e; e = e.nextOut) {
      const child = e.to;
      const s = child.runtime;

      if (!(s & STALE)) continue; // already clean
      if (s & ReactiveNodeState.Obsolete) continue; // dirty from another source — don't touch

      // FIX #3: clear only Invalid, leave Obsolete untouched
      child.runtime = s & ~ReactiveNodeState.Invalid;
      stack.push(child);
    }
  }
}
