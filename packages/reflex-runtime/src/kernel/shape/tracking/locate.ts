import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import { findEdgeInLockstep } from "@runtime/kernel/shape/graph/findEdge";
import type ReactiveNode from "@runtime/kernel/shape/node";

/**
 * Locate the edge `producer -> consumer` for a read that no locality tier
 * settled, or prove that there is none.
 *
 * The producer's outgoing list is consulted first, in constant time:
 *
 * - no outgoing edge proves absence;
 * - the newest outgoing edge is the pair's when the edge was linked earlier
 *   in this pass, or is the producer's only edge;
 * - a single outgoing edge to another consumer proves absence.
 *
 * Otherwise findEdgeInLockstep decides: its four-link outgoing head start,
 * then the producer's outgoing hint (L1, INV-H), then the lockstep (L2),
 * which is the only general proof of absence. `back` and `ahead` follow its
 * coverage contract: with the incoming edges the caller has compared, they
 * cover the consumer's whole incoming list.
 */
export function locateTrackedEdge(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
): ReactiveEdge | null {
  const newest = producer.lastOut;

  if (newest === null) return null;
  if (newest.to === consumer) return newest;
  if (newest === producer.firstOut) return null;

  return findEdgeInLockstep(producer, consumer, back, ahead);
}
