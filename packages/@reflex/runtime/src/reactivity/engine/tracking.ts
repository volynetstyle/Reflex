import type ReactiveNode from "../shape/ReactiveNode";
import { isDisposedNode } from "../shape";
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

function trackReadSlowPath(source: ReactiveNode, consumer: ReactiveNode): void {
  const version = trackingVersion;
  const prevEdge = consumer.lastOutTail;

  if (prevEdge === null) {
    const firstIn = consumer.firstIn;

    if (firstIn === null || firstIn.nextIn === null) {
      consumer.lastOutTail = linkEdge(source, consumer, null, version);
      return;
    }

    consumer.lastOutTail = trackReadFallback(
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
    consumer.lastOutTail = linkEdge(source, consumer, prevEdge, version);
    return;
  }

  consumer.lastOutTail = trackReadFallback(
    source,
    consumer,
    prevEdge,
    nextExpected,
    version,
  );
}

function trackReadMiss(source: ReactiveNode, consumer: ReactiveNode): void {
  const sourceDead = isDisposedNode(source);
  const consumerDead = isDisposedNode(consumer);

  if (sourceDead || consumerDead) {
    if (__DEV__) {
      devAssertTrackReadAlive(sourceDead, consumerDead);
    }

    return;
  }

  recordTrackRead(consumer, source);
  trackReadSlowPath(source, consumer);
}

/**
 * Cursor-guided incoming-edge walk used during dependency collection.
 * It first probes the hot cache and expected next edge, then falls back to a
 * linear scan that reorders the found edge into the reused dependency prefix.
 */
export function trackRead(source: ReactiveNode): void {
  const consumer = activeConsumer;

  if (!consumer) return;
  if (tryTrackReadFastPath(source, consumer)) return;
  trackReadMiss(source, consumer);
}

/**
 * Consumer-local cursor fast path that avoids entering the full tracking path
 * when the next unique dependency is already obvious from the current cursor.
 *
 * - Immediate duplicate (`lastOutTail.from === source`) is structurally inert.
 * - Expected next (`lastOutTail.nextIn === source`, or `firstIn` when no tail yet)
 *   reuses the existing edge and advances the cursor.
 */
export function tryTrackReadFastPath(
  source: ReactiveNode,
  consumer: ReactiveNode,
): boolean {
  const prevEdge = consumer.lastOutTail;
  const version = trackingVersion;

  const lastOut = source.lastOut;
  if (
    lastOut != null &&
    lastOut.version === version &&
    lastOut.to === consumer
  ) {
    recordTrackRead(consumer, source);
    return true;
  }

  if (prevEdge != null) {
    if (prevEdge.from === source) {
      prevEdge.version = version;
      recordTrackRead(consumer, source);
      return true;
    }

    const nextExpected = prevEdge.nextIn;
    if (nextExpected != null && nextExpected.from === source) {
      nextExpected.version = version;
      consumer.lastOutTail = nextExpected;
      recordTrackRead(consumer, source);
      recordTrackRead(consumer, source);
      return true;
    }

    return false;
  }

  const firstIn = consumer.firstIn;
  if (firstIn != null && firstIn.from === source) {
    firstIn.version = version;
    consumer.lastOutTail = firstIn;
    recordTrackRead(consumer, source);
    recordTrackRead(consumer, source);
    return true;
  }

  return false;
}

export function trackReadActive(
  source: ReactiveNode,
  consumer: ReactiveNode,
): void {
  const sourceDead = isDisposedNode(source);
  const consumerDead = isDisposedNode(consumer);

  if (sourceDead || consumerDead) {
    if (__DEV__) {
      devAssertTrackReadAlive(sourceDead, consumerDead);
    }

    return;
  }

  recordTrackRead(consumer, source);

  const version = trackingVersion;
  const prevEdge = consumer.lastOutTail;
  if (prevEdge === null) {
    const firstIn = consumer.firstIn;

    if (firstIn === null) {
      consumer.lastOutTail = linkEdge(source, consumer, null, version);
      return;
    }

    if (firstIn.from === source) {
      firstIn.version = version;
      consumer.lastOutTail = firstIn;
      return;
    }

    if (firstIn.nextIn === null) {
      consumer.lastOutTail = linkEdge(source, consumer, null, version);
      return;
    }

    consumer.lastOutTail = trackReadFallback(
      source,
      consumer,
      null,
      firstIn,
      version,
    );
    return;
  }

  if (prevEdge.from === source) {
    prevEdge.version = version;
    return;
  }

  const nextExpected = prevEdge.nextIn;
  if (nextExpected === null) {
    consumer.lastOutTail = linkEdge(source, consumer, prevEdge, version);
    return;
  }

  if (nextExpected.from === source) {
    nextExpected.version = version;
    consumer.lastOutTail = nextExpected;
    return;
  }

  if (nextExpected.nextIn === null) {
    consumer.lastOutTail = linkEdge(source, consumer, prevEdge, version);
    return;
  }

  consumer.lastOutTail = trackReadFallback(
    source,
    consumer,
    prevEdge,
    nextExpected,
    version,
  );
}

/**
 * Suffix cleanup over the consumer's incoming edges after recompute.
 * Everything after lastOutTail belongs to the old dependency list and is unlinked.
 */
export function cleanupStaleSources(node: ReactiveNode): void {
  const tail = node.lastOutTail;
  const staleHead = tail === null ? node.firstIn : tail.nextIn;
  if (staleHead === null) return;
  const detachedStaleHead: NonNullable<typeof staleHead> = staleHead;

  if (tail === null) {
    node.firstIn = null;
    node.lastIn = null;
  } else {
    tail.nextIn = null;
    node.lastIn = tail;
  }

  if (__DEV__) {
    devRecordCleanupStaleSources(node, detachedStaleHead, defaultContext);
  }

  unlinkDetachedIncomingEdgeSequence(detachedStaleHead);
}
