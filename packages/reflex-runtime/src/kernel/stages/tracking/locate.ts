import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import { findEdgeInLockstep } from "@runtime/kernel/shape/graph/findEdge";
import { BirthUnordered } from "@runtime/kernel/shape/meta";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { trackingBound, trackingBoundConsumer } from "@runtime/kernel/state";
import { observeRuntimeProjection } from "@runtime/kernel/projection";

/**
 * Birth-order proof of absence (INV-T4), in constant time.
 *
 * Any edge of the pair that existed when the consumer's activation entered
 * was born no later than the bound taken then: born <= stamp, and the head
 * of the incoming list carries its largest stamp. While the bound still
 * names this consumer, no activation has entered since, so nothing but this
 * pass appended to the producer's outgoing list, and an edge this pass
 * linked for the pair is the newest one, already compared by the caller. So
 * when the outgoing list is sorted by birth and its first edge is born after
 * the bound, the pair has no edge.
 */
function isAbsentByBirth(
  producer: ReactiveNode,
  consumer: ReactiveNode,
): boolean {
  const bound = trackingBound;
  if (
    trackingBoundConsumer === consumer &&
    bound !== 0 &&
    (producer.state & BirthUnordered) === 0 &&
    producer.firstOut!.born > bound
  ) {
    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.tracking.locate.birth");
    return true;
  }
  return false;
}

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
 * Otherwise findEdgeInLockstep decides: the producer's outgoing hint (L1,
 * INV-H), its two-link outgoing head start, then the lockstep (L2), raced by
 * the outgoing finger when the producer holds one. The lockstep is the only
 * general proof of absence. `back` and `ahead` follow its coverage contract:
 * with the incoming edges the caller has compared, they cover the consumer's
 * whole incoming list.
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

  if (isAbsentByBirth(producer, consumer) === true) return null;

  return findEdgeInLockstep(producer, consumer, back, ahead);
}

/**
 * Locate the edge `producer -> consumer` for a cursor miss inside the list:
 * the newest outgoing edge, then findEdgeInLockstep.
 *
 * A cursor miss inside the list is a reorder, and its read usually finds an
 * edge, so the empty-list and sole-edge probes, which settle only absence,
 * are left to the lookup (both are answered there as well, by the hint miss
 * and the head start).
 *
 * JIT: separate from locateTrackedEdge on purpose. With the two absence
 * probes this path compiled to more code inside the miss handler and cost
 * A.track.reorder-128-shuffled +8.7% (paired CI on the locate stage).
 */
export function locateReorderedEdge(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
): ReactiveEdge | null {
  const newest = producer.lastOut;
  if (newest !== null) {
    if (newest.to === consumer) return newest;
    if (isAbsentByBirth(producer, consumer) === true) return null;
  }

  return findEdgeInLockstep(producer, consumer, back, ahead);
}
