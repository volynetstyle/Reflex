import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import type ReactiveNode from "@runtime/kernel/shape/node";

/**
 * Unlink a sequence of incoming edges, from `edge` along `nextIn`, from the
 * outgoing lists of their producers, and clear their links.
 *
 * Precondition: the caller has already cut the sequence out of its
 * consumer's incoming list (`firstIn`/`lastIn` and the edge before it are
 * repaired), so only the producer side is left.
 */
export function unlinkDetachedIncomingEdgeSequence(
  edge: ReactiveEdge | null,
): void {
  while (edge !== null) {
    const nextIn = edge.nextIn;
    const { from, prevOut, nextOut } = edge;

    // A hint never outlives its edge (INV-H). The consumer's own cursor is
    // never in a detached sequence: callers detach after it or clear it.
    if (from.tailIn === edge) from.tailIn = null;

    if (prevOut !== null) prevOut.nextOut = nextOut;
    else from.firstOut = nextOut;

    if (nextOut !== null) nextOut.prevOut = prevOut;
    else from.lastOut = prevOut;

    edge.prevOut = null;
    edge.nextOut = null;
    edge.prevIn = null;
    edge.nextIn = null;

    edge = nextIn;
  }
}

/**
 * Unlink every incoming edge of `node` and clear its cursor: the source side
 * of disposal. Cold path.
 */
export function unlinkAllSources(node: ReactiveNode): void {
  const edge = node.firstIn;

  node.firstIn = null;
  node.lastIn = null;
  node.tailIn = null;

  unlinkDetachedIncomingEdgeSequence(edge);
}

/**
 * Unlink every outgoing edge of `node` and clear its hint: the subscriber
 * side of disposal. A subscriber whose cursor is on a removed edge gets the
 * edge before it. Cold path.
 */
export function unlinkAllSubscribers(node: ReactiveNode): void {
  let edge = node.firstOut;
  const hint = node.tailIn;

  // Every outgoing edge goes, so a hint goes with them (INV-H). A self-edge
  // in the slot is incoming and is repaired by the loop below.
  if (hint !== null && hint.from === node && hint.to !== node) {
    node.tailIn = null;
  }

  node.firstOut = null;
  node.lastOut = null;

  while (edge !== null) {
    const nextOut = edge.nextOut;
    const { to, prevIn, nextIn } = edge;

    if (to.tailIn === edge) {
      to.tailIn = prevIn;
    }

    if (prevIn !== null) prevIn.nextIn = nextIn;
    else to.firstIn = nextIn;

    if (nextIn !== null) nextIn.prevIn = prevIn;
    else to.lastIn = prevIn;

    edge.prevOut = null;
    edge.nextOut = null;
    edge.prevIn = null;
    edge.nextIn = null;

    edge = nextOut;
  }
}
