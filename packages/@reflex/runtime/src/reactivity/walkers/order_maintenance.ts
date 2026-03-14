import { ReactiveNode } from "../..";

const GAP = 1 << 8;
const REBALANCE = 32;

// @__INLINE__
export function order(a: ReactiveNode, b: ReactiveNode) {
  return a.rank < b.rank;
}

// @__INLINE__
export function removePeer(node: ReactiveNode) {
  const prev = node.prevPeer;
  const next = node.nextPeer;

  if (prev) prev.nextPeer = next;
  if (next) next.prevPeer = prev;

  node.prevPeer = null;
  node.nextPeer = null;
}

// A <-> B <-> C

// @__INLINE__
export function insertPeer(target: ReactiveNode, node: ReactiveNode) {
  const next = target.nextPeer;

  // fast path
  if (next === null) {
    node.rank = target.rank + GAP;
    node.prevPeer = target;
    node.nextPeer = null;
    target.nextPeer = node;
    return;
  }

  let gap = next.rank - target.rank;

  if (gap <= 1) {
    let cur: ReactiveNode | null = target;
    let label = target.rank;

    for (let i = 0; i < REBALANCE && cur; i++) {
      cur.rank = label;
      label += GAP;
      cur = cur.nextPeer;
    }

    gap = next.rank - target.rank;
  }

  const mid = target.rank + (gap >> 1);

  node.rank = mid;
  node.prevPeer = target;
  node.nextPeer = next;

  target.nextPeer = node;
  next.prevPeer = node;
}
