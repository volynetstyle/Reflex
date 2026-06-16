import type ReactiveNode from "../node";
import type { ReactiveEdge } from "../edge";

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

  for (
    let scanned = 0;
    edge !== null && scanned < PrefixScanLimit;
    scanned += 1
  ) {
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
    if (edge.to === consumer && edge.version === producerVersion) return true;
  }

  return false;
}
