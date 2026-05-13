import type ReactiveNode from "../shape/node";
import { devRecordCleanupStaleSources, devRecordTrackRead } from "../dev";
import {
  linkEdge,
  unlinkDetachedIncomingEdgeSequence,
} from "../shape/graph/connect";
import { moveIncomingEdgeAfterUnchecked } from "../shape/graph/edgeList";
import {
  activeConsumer,
  defaultContext,
  trackingVersion,
  trackReadFallback,
} from "../context";

function trackReadSlowPath(
  source: ReactiveNode,
  consumer: ReactiveNode,
  version: number,
  prevEdge: ReactiveNode["lastInTail"],
): void {
  if (prevEdge === null) {
    const firstIn = consumer.firstIn;

    if (firstIn === null || firstIn.nextIn === null) {
      consumer.lastInTail = linkEdge(source, consumer, null, version);
      return;
    }

    consumer.lastInTail = trackReadFallback(
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
    consumer.lastInTail = linkEdge(source, consumer, prevEdge, version);
    return;
  }

  consumer.lastInTail = trackReadFallback(
    source,
    consumer,
    prevEdge,
    nextExpected,
    version,
  );
}

function trackReadResolved(
  source: ReactiveNode,
  consumer: ReactiveNode,
  version: number,
  slowPath: boolean,
): boolean {
  const prevEdge = consumer.lastInTail;

  if (prevEdge !== null) {
    if (prevEdge.from === source) {
      prevEdge.version = version;
      if (__DEV__) devRecordTrackRead(defaultContext, consumer, source);
      return true;
    }

    const nextExpected = prevEdge.nextIn;
    if (nextExpected !== null && nextExpected.from === source) {
      nextExpected.version = version;
      consumer.lastInTail = nextExpected;
      if (__DEV__) devRecordTrackRead(defaultContext, consumer, source);
      return true;
    }

    if (nextExpected === null) {
      if (hasTrackedPrefixDependency(source, prevEdge.prevIn)) {
        if (__DEV__) devRecordTrackRead(defaultContext, consumer, source);
        return true;
      }

      consumer.lastInTail = linkEdge(source, consumer, prevEdge, version);
      if (__DEV__) devRecordTrackRead(defaultContext, consumer, source);
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
      consumer.lastInTail = next1;
      if (__DEV__) devRecordTrackRead(defaultContext, consumer, source);
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
        consumer.lastInTail = next2;
        if (__DEV__) devRecordTrackRead(defaultContext, consumer, source);
        return true;
      }
    }

    const lastIn = consumer.lastIn;
    if (lastIn !== null && lastIn.from === source) {
      moveIncomingEdgeAfterUnchecked(consumer, lastIn, prevEdge);
      lastIn.version = version;
      consumer.lastInTail = lastIn;
      if (__DEV__) devRecordTrackRead(defaultContext, consumer, source);
      return true;
    }

    if (hasTrackedPrefixDependency(source, prevEdge.prevIn)) {
      if (__DEV__) devRecordTrackRead(defaultContext, consumer, source);
      return true;
    }

    if (!slowPath) return false;
  } else {
    const firstIn = consumer.firstIn;
    if (firstIn === null) {
      consumer.lastInTail = linkEdge(source, consumer, null, version);
      if (__DEV__) devRecordTrackRead(defaultContext, consumer, source);
      return true;
    }

    if (firstIn.from === source) {
      firstIn.version = version;
      consumer.lastInTail = firstIn;
      if (__DEV__) devRecordTrackRead(defaultContext, consumer, source);
      return true;
    }

    const lastIn = consumer.lastIn;
    if (lastIn !== null && lastIn.from === source) {
      moveIncomingEdgeAfterUnchecked(consumer, lastIn, null);
      lastIn.version = version;
      consumer.lastInTail = lastIn;
      if (__DEV__) devRecordTrackRead(defaultContext, consumer, source);
      return true;
    }

    if (!slowPath) return false;
  }

  if (__DEV__) devRecordTrackRead(defaultContext, consumer, source);
  trackReadSlowPath(source, consumer, version, prevEdge);
  return true;
}

function hasTrackedPrefixDependency(
  source: ReactiveNode,
  edge: ReactiveNode["lastInTail"],
): boolean {
  for (let current = edge; current !== null; current = current.prevIn) {
    if (current.from === source) return true;
  }

  return false;
}

/**
 * Fast cursor-guided dependency tracking.
 *
 * Handles:
 * - immediate duplicate read
 * - expected next dependency
 * - duplicate already accepted in the current dependency prefix
 * - first dependency reuse
 */
export function tryTrackReadFastPath(
  source: ReactiveNode,
  consumer: ReactiveNode,
): boolean {
  return trackReadResolved(source, consumer, trackingVersion, false);
}

/**
 * Track read for the current active consumer.
 *
 */
export function trackRead(source: ReactiveNode): void {
  const consumer = activeConsumer;

  if (consumer === null) return;

  trackReadResolved(source, consumer, trackingVersion, true);
}

/**
 * Track read when the consumer is already known.
 *
 * Unlike trackRead(), this accepts an already known consumer.
 */
export function trackReadActive(
  source: ReactiveNode,
  consumer = activeConsumer as NonNullable<ReactiveNode>,
): void {
  trackReadResolved(source, consumer, trackingVersion, true);
}

/**
 * Suffix cleanup over the consumer's incoming edges after recompute.
 *
 * Everything after lastInTail belongs to the old dependency list and is unlinked.
 */
export function cleanupStaleSources(node: ReactiveNode): void {
  const tail = node.lastInTail;
  const staleHead = tail === null ? node.firstIn : tail.nextIn;

  if (staleHead === null) return;

  if (tail === null) {
    node.firstIn = null;
    node.lastIn = null;
  } else {
    tail.nextIn = null;
    node.lastIn = tail;
  }

  devRecordCleanupStaleSources(node, staleHead, defaultContext);

  unlinkDetachedIncomingEdgeSequence(staleHead);
}
