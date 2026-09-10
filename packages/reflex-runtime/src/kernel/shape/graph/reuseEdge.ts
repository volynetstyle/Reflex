import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { profileRuntimeCounter } from "@runtime/profiling";

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

  profileRuntimeCounter("trackingEdgeMoved");
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

function findOutgoingEdgeToConsumer(
  producer: ReactiveNode,
  consumer: ReactiveNode,
): ReactiveEdge | null {
  for (let edge = producer.firstOut; edge !== null; edge = edge.nextOut) {
    if (edge.to === consumer) return edge;
  }

  return null;
}

function detachIncomingSuffix(
  consumer: ReactiveNode,
  insertAfterEdge: ReactiveEdge | null,
  suffixStartEdge: ReactiveEdge,
): void {
  profileRuntimeCounter("trackingSuffixEagerDetach");

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
 * Resolve a producer -> consumer incoming edge relative to a known insertion
 * position.
 *
 * The function tries to reuse an existing edge from the remaining incoming
 * suffix. If no such edge exists, it links a new edge after `insertAfterEdge`.
 *
 * This is the general reconciliation helper used after optimistic fast paths
 * fail or by a selected read tracking strategy.
 *
 * Levels:
 *
 * R0: suffix head hit
 *     The expected suffix edge already points from the producer.
 *
 * R0.5: first outgoing edge hit
 *     Before scanning the consumer suffix, check the producer's first outgoing
 *     edge as the cheapest existing graph lookup.
 *
 * R1: suffix scan and reuse
 *     Search the remaining suffix for an existing producer edge and move it
 *     after the insertion point if needed.
 *
 * R2: suffix miss
 *     No reusable edge exists, so link a new incoming edge.
 */
export function reuseIncomingEdgeFromSuffixOrLink(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  insertAfterEdge: ReactiveEdge | null,
  suffixStartEdge: ReactiveEdge | null,
  producerVersion = 0,
): ReactiveEdge {
  /**
   * R0: Suffix head hit.
   *
   * The first candidate in the suffix already matches the producer.
   * No list mutation is needed.
   */
  if (suffixStartEdge !== null && suffixStartEdge.from === producer) {
    suffixStartEdge.version = producerVersion;
    profileRuntimeCounter("trackingSuffixHeadHit");
    return suffixStartEdge;
  }

  /**
   * R0.5: First outgoing edge hit.
   *
   * This is not an index and does not scan the producer's outgoing list.
   * It only reuses the first outgoing edge when it already points to this
   * consumer, which covers the fanout-1 pathological reorder cases cheaply.
   */
  if (producerVersion !== 0) {
    const edge = producer.firstOut;
    if (edge === null || edge.to !== consumer) {
      profileRuntimeCounter("trackingOutgoingProbeMiss");
    } else if (edge.version !== producerVersion) {
      moveIncomingEdgeToPosition(consumer, edge, insertAfterEdge);
      edge.version = producerVersion;
      profileRuntimeCounter("trackingOutgoingProbeHit1");
      return edge;
    }
  }

  return /* @__NOINLINE__ */ reconcileIncomingSuffix(
    producer,
    consumer,
    insertAfterEdge,
    suffixStartEdge,
    producerVersion,
  );
}

/** Full scans and eager detachment stay out of the direct-reuse hot path. */
function reconcileIncomingSuffix(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  insertAfterEdge: ReactiveEdge | null,
  suffixStartEdge: ReactiveEdge | null,
  producerVersion: number,
): ReactiveEdge {
  /**
   * R1: Suffix scan.
   *
   * Start after the suffix head if it exists, otherwise scan from the
   * beginning of the incoming list.
   */
  let scannedSuffixEdges = suffixStartEdge === null ? 0 : 1;
  const outgoingProbeAt =
    suffixStartEdge !== null && producerVersion !== 0
      ? EAGER_STALE_SUFFIX_CLEANUP_MIN
      : -1;

  for (
    let candidateEdge =
      suffixStartEdge === null ? consumer.firstIn : suffixStartEdge.nextIn;
    candidateEdge !== null;
    candidateEdge = candidateEdge.nextIn
  ) {
    scannedSuffixEdges += 1;
    profileRuntimeCounter("trackingSuffixEdgesScanned");

    if (candidateEdge.from !== producer) {
      if (scannedSuffixEdges === outgoingProbeAt) {
        const producerEdge = findOutgoingEdgeToConsumer(producer, consumer);

        if (producerEdge === null) {
          detachIncomingSuffix(consumer, insertAfterEdge, suffixStartEdge!);
          profileRuntimeCounter("trackingSuffixLinkNew");
          return linkEdge(producer, consumer, insertAfterEdge, producerVersion);
        }

        if (producerEdge.version !== producerVersion) {
          if (producerEdge.prevIn !== insertAfterEdge) {
            moveIncomingEdgeToPosition(consumer, producerEdge, insertAfterEdge);
          }

          producerEdge.version = producerVersion;
          return producerEdge;
        }
      }

      continue;
    }

    /**
     * Reuse the existing edge.
     *
     * If it is not already after the requested insertion point,
     * move it into the current tracked order.
     */
    if (candidateEdge.prevIn !== insertAfterEdge) {
      moveIncomingEdgeToPosition(consumer, candidateEdge, insertAfterEdge);
    }

    candidateEdge.version = producerVersion;
    profileRuntimeCounter("trackingSuffixReuseHit");
    return candidateEdge;
  }

  /**
   * R2: Suffix miss.
   *
   * The producer was not found in the reusable suffix, so this read introduces
   * a new dependency edge. Once a full suffix scan misses, the previous suffix
   * cannot contribute to the current tracked order anymore. Detach it eagerly
   * so branch-swap/churn patterns pay one stale-suffix scan instead of one scan
   * per newly introduced dependency.
   */
  if (
    suffixStartEdge !== null &&
    scannedSuffixEdges >= EAGER_STALE_SUFFIX_CLEANUP_MIN
  ) {
    detachIncomingSuffix(consumer, insertAfterEdge, suffixStartEdge);
  }

  profileRuntimeCounter("trackingSuffixLinkNew");
  return linkEdge(producer, consumer, insertAfterEdge, producerVersion);
}

export const reuseIncomingEdgeFromSuffixOrCreate =
  reuseIncomingEdgeFromSuffixOrLink;
