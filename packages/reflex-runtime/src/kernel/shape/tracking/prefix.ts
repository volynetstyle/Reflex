import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import type ReactiveNode from "@runtime/kernel/shape/node";

const PrefixScanLimit = 32;

export const PrefixMiss = 0;
export const PrefixHit = 1;
export const PrefixScanLimitReached = 2;

export type PrefixScanResult =
  | typeof PrefixMiss
  | typeof PrefixHit
  | typeof PrefixScanLimitReached;

export function scanProducerInTrackedPrefix(
  producer: ReactiveNode,
  cursorEdge: ReactiveEdge,
): PrefixScanResult {
  let edge = cursorEdge.prevIn;

  // Four links per iteration retain the exact 32-edge bound while reducing
  // loop bookkeeping on dynamic reads with long visited prefixes.
  for (let scanned = 0; scanned < PrefixScanLimit; scanned += 4) {
    if (edge === null) return PrefixMiss;
    if (edge.from === producer) return PrefixHit;
    edge = edge.prevIn;
    if (edge === null) return PrefixMiss;
    if (edge.from === producer) return PrefixHit;
    edge = edge.prevIn;
    if (edge === null) return PrefixMiss;
    if (edge.from === producer) return PrefixHit;
    edge = edge.prevIn;
    if (edge === null) return PrefixMiss;
    if (edge.from === producer) return PrefixHit;
    edge = edge.prevIn;
  }

  return edge === null ? PrefixMiss : PrefixScanLimitReached;
}

/*
 * Preconditions:
 * - producerVersion !== 0
 */
export function hasProducerEdgeInCurrentPassUnchecked(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  producerVersion: number,
): boolean {
  for (let edge = producer.firstOut; edge !== null; edge = edge.nextOut) {
    if (edge.to === consumer && edge.version === producerVersion) {
      return true;
    }
  }

  return false;
}

/**
 * Membership at the physical incoming tail. A current-version edge to this
 * consumer is necessarily in the visited prefix. A complete short outgoing
 * list with no edge to the consumer proves absence without scanning incoming
 * edges. Inconclusive probes retain the bounded-prefix/version-zero behavior.
 */
export function hasProducerInCompletedPrefix(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  cursorEdge: ReactiveEdge,
  producerVersion: number,
): boolean {
  const lastOut = producer.lastOut;
  if (
    producerVersion !== 0 &&
    lastOut !== null &&
    lastOut.to === consumer &&
    lastOut.version === producerVersion
  ) {
    return true;
  }

  let outgoing = producer.firstOut;
  for (let probed = 0; probed < 4; ++probed) {
    if (outgoing === null) return false;
    if (outgoing.to === consumer) {
      if (producerVersion !== 0 && outgoing.version === producerVersion) {
        return true;
      }
      break;
    }
    outgoing = outgoing.nextOut;
  }
  if (outgoing === null) return false;

  const result = scanProducerInTrackedPrefix(producer, cursorEdge);
  return (
    result === PrefixHit ||
    (result === PrefixScanLimitReached &&
      producerVersion !== 0 &&
      hasProducerEdgeInCurrentPassUnchecked(
        producer,
        consumer,
        producerVersion,
      ))
  );
}

/** Prefix membership while an unvisited suffix still follows the cursor. */
export function hasProducerInTrackedPrefix(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  cursorEdge: ReactiveEdge,
  producerVersion: number,
): boolean {
  const firstOut = producer.firstOut;
  if (
    firstOut === null ||
    (firstOut.nextOut === null && firstOut.to !== consumer)
  ) {
    return false;
  }

  // The incoming head precedes this non-matching cursor. A matching nonzero
  // version also satisfies the distant-prefix fallback, at any prefix length.
  const firstIn = consumer.firstIn!;
  if (
    firstIn.from === producer &&
    producerVersion !== 0 &&
    firstIn.version === producerVersion
  ) {
    return true;
  }

  const result = scanProducerInTrackedPrefix(producer, cursorEdge);
  return (
    result === PrefixHit ||
    (result === PrefixScanLimitReached &&
      producerVersion !== 0 &&
      hasProducerEdgeInCurrentPassUnchecked(
        producer,
        consumer,
        producerVersion,
      ))
  );
}
