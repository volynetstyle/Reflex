import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import { findEdgeInLockstep } from "@runtime/kernel/shape/graph/findEdge";
import type ReactiveNode from "@runtime/kernel/shape/node";

/**
 * Locate the edge `producer -> consumer` for a read that no locality tier
 * settled, or prove that there is none.
 *
 * The producer's newest outgoing edge is the pair's when the edge was linked
 * earlier in this pass, or is the producer's only edge. Outside a reorder
 * (`reorder` false), the outgoing list is also consulted for absence in
 * constant time: no outgoing edge, or a single one to another consumer,
 * proves it.
 *
 * Otherwise findEdgeInLockstep decides: the producer's outgoing hint (L1,
 * INV-H), its two-link outgoing head start, then the lockstep (L2), raced by
 * the outgoing finger when the producer holds one. The lockstep is the only
 * general proof of absence. `back` and `ahead` follow its coverage contract:
 * with the incoming edges the caller has compared, they cover the consumer's
 * whole incoming list.
 *
 * A cursor miss inside the list is a reorder, and its read usually finds an
 * edge, so the two absence probes are left to the lookup there (both are
 * answered by the hint miss and the head start). With them that path
 * compiled to more code and cost A.track.reorder-128-shuffled +8.7% (paired
 * CI on the locate stage).
 *
 * JIT: one function and one call site of findEdgeInLockstep for every miss
 * kind, so the miss handler that inlines it carries one copy.
 */
export function locateEdge(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
  reorder: boolean,
): ReactiveEdge | null {
  const newest = producer.lastOut;

  if (newest !== null) {
    if (newest.to === consumer) return newest;
    if (reorder === false && newest === producer.firstOut) return null;
  } else if (reorder === false) {
    return null;
  }

  return findEdgeInLockstep(producer, consumer, back, ahead);
}
