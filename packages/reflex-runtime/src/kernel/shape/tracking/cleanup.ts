import type ReactiveNode from "../node";
import type { ReactiveEdge } from "../edge";
import { devRecordCleanupStaleSources } from "../../dev";
import { defaultContext } from "../../context";

/**
 * Suffix cleanup over the consumer's incoming edges after recompute.
 *
 * Everything after tailIn belongs to the old dependency list and is unlinked.
 */
export function cleanupUnvisitedSources(node: ReactiveNode): void {
  const tail = node.tailIn;
  const staleHead = tail === null ? node.firstIn : tail.nextIn;

  if (staleHead === null) return;

  if (tail === null) {
    node.firstIn = node.lastIn = null;
  } else {
    tail.nextIn = null;
    node.lastIn = tail;
  }

  if (__DEV__) {
    devRecordCleanupStaleSources(node, staleHead, defaultContext);
  }

  let edge: ReactiveEdge | null = staleHead;

  do {
    const nextIn: ReactiveEdge | null = edge.nextIn;

    const from = edge.from;
    const prevOut = edge.prevOut;
    const nextOut = edge.nextOut;

    if (prevOut !== null) {
      prevOut.nextOut = nextOut;
    } else {
      from.firstOut = nextOut;
    }

    if (nextOut !== null) {
      nextOut.prevOut = prevOut;
    } else {
      from.lastOut = prevOut;
    }

    edge.prevOut = edge.nextOut = edge.prevIn = edge.nextIn = null;

    edge = nextIn;
  } while (edge !== null);
}
