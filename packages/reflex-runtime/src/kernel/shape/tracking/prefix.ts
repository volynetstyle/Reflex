import type ReactiveNode from "../node";
import type { ReactiveEdge } from "../edge";

const PrefixScanLimit = 32;

export function isProducerInTrackedPrefix(
  producer: ReactiveNode,
  cursorEdge: ReactiveEdge,
): boolean | null {
  let edge = cursorEdge.prevIn;

  for (
    let scanned = 0;
    edge !== null && scanned < PrefixScanLimit;
    scanned += 1
  ) {
    if (edge.from === producer) return true;
    edge = edge.prevIn;
  }

  return edge === null ? false : null;
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
