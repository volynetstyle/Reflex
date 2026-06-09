import type { ReactiveEdge } from "../edge";
import type ReactiveNode from "../node";
import {
  moveIncomingEdgeAfterUnchecked,
  moveLastIncomingEdgeAfterEdgeUnchecked,
  moveLastIncomingEdgeToFrontUnchecked,
  moveMiddleIncomingEdgeAfterEdgeUnchecked,
  moveNonHeadIncomingEdgeToFrontUnchecked,
} from "./edgeList";
import { linkEdge } from "./linkEdge";
import { unlinkDetachedIncomingEdgeSequence } from "./sweepEdges";

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
  if (suffixStartEdge?.from === producer) {
    suffixStartEdge.version = producerVersion;
    return suffixStartEdge;
  }

  /**
   * R1: Suffix scan.
   *
   * Start after the suffix head if it exists, otherwise scan from the
   * beginning of the incoming list.
   */
  for (
    let candidateEdge = suffixStartEdge?.nextIn ?? consumer.firstIn;
    candidateEdge;
    candidateEdge = candidateEdge.nextIn
  ) {
    if (candidateEdge.from !== producer) continue;

    /**
     * Reuse the existing edge.
     *
     * If it is not already after the requested insertion point,
     * move it into the current tracked order.
     */
    if (candidateEdge.prevIn !== insertAfterEdge) {
      if (insertAfterEdge === null) {
        if (candidateEdge.nextIn === null) {
          moveLastIncomingEdgeToFrontUnchecked(consumer, candidateEdge);
        } else {
          moveNonHeadIncomingEdgeToFrontUnchecked(consumer, candidateEdge);
        }
      } else if (candidateEdge.prevIn === null) {
        moveIncomingEdgeAfterUnchecked(
          consumer,
          candidateEdge,
          insertAfterEdge,
        );
      } else if (candidateEdge.nextIn === null) {
        moveLastIncomingEdgeAfterEdgeUnchecked(
          consumer,
          candidateEdge,
          insertAfterEdge,
        );
      } else {
        moveMiddleIncomingEdgeAfterEdgeUnchecked(
          consumer,
          candidateEdge,
          insertAfterEdge,
        );
      }
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
  if (suffixStartEdge !== null) {
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

  return linkEdge(producer, consumer, insertAfterEdge, producerVersion);
}

export const reuseIncomingEdgeFromSuffixOrCreate =
  reuseIncomingEdgeFromSuffixOrLink;
