import { INVALID, ReactiveNode, ReactiveNodeState } from "../shape";

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
  let clean = true;

  for (let e = node.firstIn; e; e = e.nextIn) {
    if (e.from.runtime & INVALID) {
      clean = false;
      break;
    }
  }

  if (!clean) {
    return;
  }

  while (stack.length) {
    const n = stack.pop()!;

    for (let e = n.firstOut; e; e = e.nextOut) {
      const child = e.to;

      let s = child.runtime;

      // clear Invalid
      if (s & ReactiveNodeState.Invalid) {
        s &= ~ReactiveNodeState.Invalid;
        child.runtime = s;
      } else {
        // если Invalid не было — дальше идти нет смысла
        continue;
      }

      // если точно устарел — не продолжаем
      if (s & ReactiveNodeState.Obsolete) continue;

      stack.push(child);
    }
  }
}
