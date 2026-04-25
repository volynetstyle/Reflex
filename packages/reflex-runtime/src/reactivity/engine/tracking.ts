import type ReactiveNode from "../shape/ReactiveNode";
import { Disposed } from "../shape";
import {
  devAssertTrackReadAlive,
  devRecordCleanupStaleSources,
  devRecordTrackRead,
} from "../dev";
import {
  linkEdge,
  unlinkDetachedIncomingEdgeSequence,
} from "../shape/methods/connect";
import {
  activeConsumer,
  defaultContext,
  trackingVersion,
  trackReadFallback,
} from "../context";

function recordTrackRead(consumer: ReactiveNode, source: ReactiveNode): void {
  if (__DEV__) {
    devRecordTrackRead(defaultContext, consumer, source);
  }
}

function isDead(source: ReactiveNode, consumer: ReactiveNode): boolean {
  const sourceDead = (source.state & Disposed) !== 0;
  const consumerDead = (consumer.state & Disposed) !== 0;

  if (sourceDead || consumerDead) {
    if (__DEV__) {
      devAssertTrackReadAlive(sourceDead, consumerDead);
    }

    return true;
  }

  return false;
}

function trackReadAttachOrFallback(
  source: ReactiveNode,
  consumer: ReactiveNode,
): void {
  const version = trackingVersion;
  const prevEdge = consumer.lastInTail;

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

/**
 * Fast cursor-guided dependency tracking.
 *
 * Handles:
 * - last outgoing cache hit
 * - immediate duplicate read
 * - expected next dependency
 * - first dependency reuse
 */
export function tryTrackReadFastPath(
  source: ReactiveNode,
  consumer: ReactiveNode,
): boolean {
  const version = trackingVersion;
  const prevEdge = consumer.lastInTail;

  const lastOut = source.lastOut;
  if (
    lastOut !== null &&
    lastOut.version === version &&
    lastOut.to === consumer
  ) {
    recordTrackRead(consumer, source);
    return true;
  }

  if (prevEdge !== null) {
    if (prevEdge.from === source) {
      prevEdge.version = version;
      recordTrackRead(consumer, source);
      return true;
    }

    const nextExpected = prevEdge.nextIn;
    if (nextExpected !== null && nextExpected.from === source) {
      nextExpected.version = version;
      consumer.lastInTail = nextExpected;
      recordTrackRead(consumer, source);
      return true;
    }

    return false;
  }

  const firstIn = consumer.firstIn;
  if (firstIn !== null && firstIn.from === source) {
    firstIn.version = version;
    consumer.lastInTail = firstIn;
    recordTrackRead(consumer, source);
    return true;
  }

  return false;
}

function trackReadMiss(source: ReactiveNode, consumer: ReactiveNode): void {
  recordTrackRead(consumer, source);
  trackReadAttachOrFallback(source, consumer);
}

/**
 * Track read for the current active consumer.
 */
export function trackRead(source: ReactiveNode): void {
  const consumer = activeConsumer;

  if (consumer === null) return;
  if (isDead(source, consumer)) return;
  if (tryTrackReadFastPath(source, consumer)) return;

  trackReadMiss(source, consumer);
}

/**
 * Track read when the consumer is already known.
 *
 * Unlike trackRead(), this preserves the old eager disposed-check behavior.
 */
export function trackReadActive(
  source: ReactiveNode,
  consumer: ReactiveNode,
): void {
  if (tryTrackReadFastPath(source, consumer)) return;

  recordTrackRead(consumer, source);
  trackReadAttachOrFallback(source, consumer);
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

  if (__DEV__) {
    devRecordCleanupStaleSources(node, staleHead, defaultContext);
  }

  unlinkDetachedIncomingEdgeSequence(staleHead);
}
