import type { ReactiveEdge } from "../edge";
import type ReactiveNode from "../node";
import { profileRuntimeCounter } from "../../../profiling";
import {
  moveIncomingEdgeAfterUnchecked,
  moveLastIncomingEdgeAfterEdgeUnchecked,
  moveLastIncomingEdgeToFrontUnchecked,
  moveMiddleIncomingEdgeAfterEdgeUnchecked,
  moveNonHeadIncomingEdgeToFrontUnchecked,
} from "./edgeList";
import { linkEdge } from "./linkEdge";
import { unlinkDetachedIncomingEdgeSequence } from "./sweepEdges";

const EAGER_STALE_SUFFIX_CLEANUP_MIN = 32;

function moveIncomingEdgeToPosition(
  consumer: ReactiveNode,
  edge: ReactiveEdge,
  insertAfterEdge: ReactiveEdge | null,
): void {
  if (edge.prevIn === insertAfterEdge) return;

  if (insertAfterEdge === null) {
    if (edge.nextIn === null) {
      moveLastIncomingEdgeToFrontUnchecked(consumer, edge);
    } else {
      moveNonHeadIncomingEdgeToFrontUnchecked(consumer, edge);
    }
  } else if (edge.prevIn === null) {
    moveIncomingEdgeAfterUnchecked(consumer, edge, insertAfterEdge);
  } else if (edge.nextIn === null) {
    moveLastIncomingEdgeAfterEdgeUnchecked(consumer, edge, insertAfterEdge);
  } else {
    moveMiddleIncomingEdgeAfterEdgeUnchecked(consumer, edge, insertAfterEdge);
  }
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

function tryResolveByFirstOutgoingEdge(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  insertAfterEdge: ReactiveEdge | null,
  producerVersion: number,
): ReactiveEdge | null {
  const edge = producer.firstOut;

  if (edge === null) {
    profileRuntimeCounter("trackingOutgoingProbeMiss");
    return null;
  }

  if (edge.to !== consumer) {
    profileRuntimeCounter("trackingOutgoingProbeMiss");
    return null;
  }

  if (edge.version === producerVersion) {
    return null;
  }

  if (edge.prevIn !== insertAfterEdge) {
    moveIncomingEdgeToPosition(consumer, edge, insertAfterEdge);
  }

  edge.version = producerVersion;
  profileRuntimeCounter("trackingOutgoingProbeHit1");
  return edge;
}

function detachIncomingSuffix(
  consumer: ReactiveNode,
  insertAfterEdge: ReactiveEdge | null,
  suffixStartEdge: ReactiveEdge,
): void {
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
    const outgoingEdge = tryResolveByFirstOutgoingEdge(
      producer,
      consumer,
      insertAfterEdge,
      producerVersion,
    );

    if (outgoingEdge !== null) return outgoingEdge;
  }

  /**
   * R1: Suffix scan.
   *
   * Start after the suffix head if it exists, otherwise scan from the
   * beginning of the incoming list.
   */
  let scannedSuffixEdges = suffixStartEdge === null ? 0 : 1;

  for (
    let candidateEdge =
      suffixStartEdge === null ? consumer.firstIn : suffixStartEdge.nextIn;
    candidateEdge !== null;
    candidateEdge = candidateEdge.nextIn
  ) {
    scannedSuffixEdges += 1;

    if (candidateEdge.from !== producer) {
      if (
        suffixStartEdge !== null &&
        producerVersion !== 0 &&
        scannedSuffixEdges === EAGER_STALE_SUFFIX_CLEANUP_MIN
      ) {
        const producerEdge = findOutgoingEdgeToConsumer(producer, consumer);

        if (producerEdge === null) {
          detachIncomingSuffix(consumer, insertAfterEdge, suffixStartEdge);
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

  return linkEdge(producer, consumer, insertAfterEdge, producerVersion);
}

export const reuseIncomingEdgeFromSuffixOrCreate =
  reuseIncomingEdgeFromSuffixOrLink;
