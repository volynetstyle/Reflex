import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { observeRuntimeProjection } from "@runtime/kernel/projection";

import { findEdgeInLockstep } from "./findEdge";
import { linkEdge } from "./linkEdge";
import { unlinkDetachedIncomingEdgeSequence } from "./sweepEdges";

const EAGER_STALE_SUFFIX_CLEANUP_MIN = 32;

function moveIncomingEdgeToPosition(
  consumer: ReactiveNode,
  edge: ReactiveEdge,
  insertAfterEdge: ReactiveEdge | null,
): void {
  const prev = edge.prevIn;
  if (prev === insertAfterEdge) return;

  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.tracking.edge.move");
  const next = edge.nextIn;

  if (insertAfterEdge === null) {
    // prev is non-null: an existing head already returned above.
    prev!.nextIn = next;
    if (next !== null) next.prevIn = prev;
    else consumer.lastIn = prev;
    const first = consumer.firstIn!;
    edge.prevIn = null;
    edge.nextIn = first;
    first.prevIn = edge;
    consumer.firstIn = edge;
    return;
  }
  // Preserve the generic primitive's head self-move no-op.
  if (prev === null && edge === insertAfterEdge) return;
  if (prev !== null) prev.nextIn = next;
  else consumer.firstIn = next;
  if (next !== null) next.prevIn = prev;
  else consumer.lastIn = prev;

  const insertNext = insertAfterEdge.nextIn;
  edge.prevIn = insertAfterEdge;
  edge.nextIn = insertNext;
  if (insertNext !== null) insertNext.prevIn = edge;
  else consumer.lastIn = edge;
  insertAfterEdge.nextIn = edge;
}

/** Whether `edge` and its successors hold at least `count` incoming edges. */
function hasIncomingRun(edge: ReactiveEdge, count: number): boolean {
  let current: ReactiveEdge | null = edge;

  for (let seen = 0; seen < count; ++seen) {
    if (current === null) return false;
    current = current.nextIn;
  }

  return true;
}

function detachIncomingSuffix(
  consumer: ReactiveNode,
  insertAfterEdge: ReactiveEdge | null,
  suffixStartEdge: ReactiveEdge,
): void {
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.tracking.suffix.detach");

  if (insertAfterEdge === null) {
    consumer.firstIn = null;
    consumer.lastIn = null;
  } else {
    insertAfterEdge.nextIn = null;
    consumer.lastIn = insertAfterEdge;
  }

  suffixStartEdge.prevIn = null;
  unlinkDetachedIncomingEdgeSequence(suffixStartEdge);
}

/**
 * Commit a read whose edge has already been located.
 *
 * `edge` is the result of an exact lookup of `producer -> consumer` that is
 * known not to lie in the tracked prefix: an existing edge is in the suffix
 * and is moved after `insertAfterEdge`; `null` means the pair has no edge and
 * a new one is linked there.
 *
 * Eager suffix detachment is a retained policy, not a search bound. When a new
 * dependency is linked in front of a suffix of at least 32 edges, the suffix
 * is unlinked at once and later reads of its producers link new edges at the
 * end of their outgoing lists. Which edge survives decides subscriber order,
 * so the rule reproduces the earlier scan-based reconciliation exactly: that
 * scan detached after missing on 32 suffix edges, except when its outgoing
 * probe had already proved absence from an empty outgoing list with a nonzero
 * stamp.
 */
export function reuseLocatedIncomingEdgeOrLink(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  insertAfterEdge: ReactiveEdge | null,
  suffixStartEdge: ReactiveEdge | null,
  producerVersion: number,
  edge: ReactiveEdge | null,
): ReactiveEdge {
  if (edge !== null) {
    moveIncomingEdgeToPosition(consumer, edge, insertAfterEdge);
    edge.version = producerVersion;

    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.tracking.suffix.reuse");
    return edge;
  }

  if (
    suffixStartEdge !== null &&
    (producerVersion === 0 || producer.firstOut !== null) &&
    hasIncomingRun(suffixStartEdge, EAGER_STALE_SUFFIX_CLEANUP_MIN) === true
  ) {
    detachIncomingSuffix(consumer, insertAfterEdge, suffixStartEdge);
  }

  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.tracking.suffix.link-new");
  return linkEdge(producer, consumer, insertAfterEdge, producerVersion);
}

/**
 * Resolve a producer -> consumer incoming edge relative to a known insertion
 * position: the default read tracking strategy.
 *
 * Precondition: `producer` was not read earlier in this pass, so any existing
 * edge of the pair lies in the suffix that starts at `suffixStartEdge` (the
 * whole incoming list when it is `null`).
 *
 * The suffix head is compared directly. Otherwise the edge is located by a
 * lockstep walk of the producer's outgoing list and the rest of the suffix,
 * and reused or linked by `reuseLocatedIncomingEdgeOrLink`.
 */
export function reuseIncomingEdgeFromSuffixOrLink(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  insertAfterEdge: ReactiveEdge | null,
  suffixStartEdge: ReactiveEdge | null,
  producerVersion = 0,
): ReactiveEdge {
  if (suffixStartEdge !== null && suffixStartEdge.from === producer) {
    suffixStartEdge.version = producerVersion;
    if (__PROFILE__)
      observeRuntimeProjection?.(
        "projection.semantic.tracking.suffix.head-hit",
      );
    return suffixStartEdge;
  }

  const edge = findEdgeInLockstep(
    producer,
    consumer,
    null,
    suffixStartEdge === null ? consumer.firstIn : suffixStartEdge.nextIn,
  );

  return reuseLocatedIncomingEdgeOrLink(
    producer,
    consumer,
    insertAfterEdge,
    suffixStartEdge,
    producerVersion,
    edge,
  );
}

export const reuseIncomingEdgeFromSuffixOrCreate =
  reuseIncomingEdgeFromSuffixOrLink;
