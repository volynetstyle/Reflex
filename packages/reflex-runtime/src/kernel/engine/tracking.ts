import type ReactiveNode from "../shape/node";
import { nodeStructureIncrement } from "../shape/node";
import { devRecordCleanupStaleSources, devRecordTrackRead } from "../dev";
import { linkEdge } from "../shape/graph";
import { moveIncomingEdgeAfterUnchecked } from "../shape/graph/edgeList";
import {
  currentConsumer,
  defaultContext,
  trackingEpoch,
  readTrackingStrategy,
} from "../context";
import type { ReactiveEdge } from "../shape";

function trackReadSlowPath(
  source: ReactiveNode,
  consumer: ReactiveNode,
  version: number,
  prevEdge: ReactiveNode["tailIn"],
): void {
  if (prevEdge === null) {
    const firstIn = consumer.firstIn;

    if (firstIn === null || firstIn.nextIn === null) {
      consumer.tailIn = linkEdge(source, consumer, null, version);
      return;
    }

    consumer.tailIn = readTrackingStrategy(
      source,
      consumer,
      null,
      firstIn,
      version,
    );
    return;
  }

  const nextExpected = prevEdge.nextIn;

  if (nextExpected === null || nextExpected.nextIn === null) {
    consumer.tailIn = linkEdge(source, consumer, prevEdge, version);
    return;
  }

  consumer.tailIn = readTrackingStrategy(
    source,
    consumer,
    prevEdge,
    nextExpected,
    version,
  );
}

export function trackReadResolved(
  source: ReactiveNode,
  consumer: ReactiveNode,
  version: number,
  slowPath: boolean,
): boolean {
  const prevEdge = consumer.tailIn;

  if (prevEdge !== null) {
    if (prevEdge.from === source) {
      prevEdge.version = version;
      devRecordTrackRead(defaultContext, consumer, source);
      return true;
    }

    const nextExpected = prevEdge.nextIn;
    if (nextExpected !== null && nextExpected.from === source) {
      nextExpected.version = version;
      consumer.tailIn = nextExpected;
      devRecordTrackRead(defaultContext, consumer, source);
      return true;
    }

    if (nextExpected === null) {
      for (
        let current = prevEdge.prevIn;
        current !== null;
        current = current.prevIn
      ) {
        if (current.from === source) {
          devRecordTrackRead(defaultContext, consumer, source);
          return true;
        }
      }

      consumer.tailIn = linkEdge(source, consumer, prevEdge, version);
      devRecordTrackRead(defaultContext, consumer, source);
      return true;
    }

    const next1 = nextExpected.nextIn;

    if (next1 !== null && next1.from === source) {
      const next = next1.nextIn;
      nextExpected.nextIn = next;
      if (next !== null) next.prevIn = nextExpected;
      else consumer.lastIn = nextExpected;
      prevEdge.nextIn = next1;
      next1.prevIn = prevEdge;
      next1.nextIn = nextExpected;
      nextExpected.prevIn = next1;
      next1.version = version;
      consumer.tailIn = next1;
      nodeStructureIncrement(consumer);
      devRecordTrackRead(defaultContext, consumer, source);
      return true;
    }

    if (next1 !== null) {
      const next2 = next1.nextIn;

      if (next2 !== null && next2.from === source) {
        const next = next2.nextIn;
        next1.nextIn = next;
        if (next !== null) next.prevIn = next1;
        else consumer.lastIn = next1;
        prevEdge.nextIn = next2;
        next2.prevIn = prevEdge;
        next2.nextIn = nextExpected;
        nextExpected.prevIn = next2;
        next2.version = version;
        consumer.tailIn = next2;
        nodeStructureIncrement(consumer);
        devRecordTrackRead(defaultContext, consumer, source);
        return true;
      }
    }

    const lastIn = consumer.lastIn;
    if (lastIn !== null && lastIn.from === source) {
      moveIncomingEdgeAfterUnchecked(consumer, lastIn, prevEdge);
      lastIn.version = version;
      consumer.tailIn = lastIn;
      devRecordTrackRead(defaultContext, consumer, source);
      return true;
    }

    for (
      let current = prevEdge.prevIn;
      current !== null;
      current = current.prevIn
    ) {
      if (current.from === source) {
        devRecordTrackRead(defaultContext, consumer, source);
        return true;
      }
    }

    if (!slowPath) return false;
  } else {
    const firstIn = consumer.firstIn;
    if (firstIn === null) {
      consumer.tailIn = linkEdge(source, consumer, null, version);
      devRecordTrackRead(defaultContext, consumer, source);
      return true;
    }

    if (firstIn.from === source) {
      firstIn.version = version;
      consumer.tailIn = firstIn;
      devRecordTrackRead(defaultContext, consumer, source);
      return true;
    }

    const lastIn = consumer.lastIn;
    if (lastIn !== null && lastIn.from === source) {
      moveIncomingEdgeAfterUnchecked(consumer, lastIn, null);
      lastIn.version = version;
      consumer.tailIn = lastIn;
      devRecordTrackRead(defaultContext, consumer, source);
      return true;
    }

    if (!slowPath) return false;
  }

  devRecordTrackRead(defaultContext, consumer, source);
  trackReadSlowPath(source, consumer, version, prevEdge);
  return true;
}

/**
 * Track read for the current active consumer.
 *
 */
export function trackRead(
  source: ReactiveNode,
  consumer = currentConsumer,
): void {
  if (consumer === null) return;
  trackReadResolved(source, consumer, trackingEpoch, true);
}

/**
 * Suffix cleanup over the consumer's incoming edges after recompute.
 *
 * Everything after tailIn belongs to the old dependency list and is unlinked.
 */
export function cleanupStaleSources(node: ReactiveNode): void {
  const tail = node.tailIn;
  const staleHead = tail === null ? node.firstIn : tail.nextIn;

  if (staleHead === null) return;

  if (tail === null) {
    node.firstIn = null;
    node.lastIn = null;
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

    edge.prevOut = null;
    edge.nextOut = null;
    edge.prevIn = null;
    edge.nextIn = null;

    edge = nextIn;
  } while (edge !== null);

  nodeStructureIncrement(node);
}
