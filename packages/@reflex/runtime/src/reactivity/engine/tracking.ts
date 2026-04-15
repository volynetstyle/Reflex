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
  activeComputed,
  defaultContext,
  trackingVersion,
  trackReadFallback,
  type ExecutionContext,
} from "../context";

/**
 * Cursor-guided incoming-edge walk used during dependency collection.
 * It first probes the hot cache and expected next edge, then falls back to a
 * linear scan that reorders the found edge into the reused dependency prefix.
 */
export function trackRead(source: ReactiveNode): void {
  const consumer = activeComputed;

  if (!consumer) return;
  if (tryTrackReadFastPath(source, consumer)) return;
  trackReadActive(source, consumer);
}

/**
 * Consumer-local cursor fast path that avoids entering the full tracking path
 * when the next unique dependency is already obvious from the current cursor.
 *
 * - Immediate duplicate (`depsTail.from === source`) is structurally inert.
 * - Expected next (`depsTail.nextIn === source`, or `firstIn` when no tail yet)
 *   reuses the existing edge and advances the cursor.
 */
export function tryTrackReadFastPath(
  source: ReactiveNode,
  consumer: ReactiveNode,
): boolean {
  const prevEdge = consumer.depsTail;
  const version = trackingVersion;

  const lastOut = source.lastOut;
  if (lastOut != null && lastOut.version === version && lastOut.to === consumer) {
    if (__DEV__) {
      devRecordTrackRead(defaultContext, consumer, source);
    }

    return true;
  }

  if (prevEdge != null) {
    if (prevEdge.from === source) {
      prevEdge.version = version;
      if (__DEV__) {
        devRecordTrackRead(defaultContext, consumer, source);
      }
      return true;
    }

    const nextExpected = prevEdge.nextIn;
    if (nextExpected != null && nextExpected.from === source) {
      nextExpected.version = version;
      consumer.depsTail = nextExpected;
      if (__DEV__) {
        devRecordTrackRead(defaultContext, consumer, source);
      }
      return true;
    }

    return false;
  }

  const firstIn = consumer.firstIn;
  if (firstIn != null && firstIn.from === source) {
    firstIn.version = version;
    consumer.depsTail = firstIn;
    if (__DEV__) {
      devRecordTrackRead(defaultContext, consumer, source);
    }
    return true;
  }

  return false;
}

export function trackReadActive(
  source: ReactiveNode,
  consumer: ReactiveNode,
  context: ExecutionContext = defaultContext,
): void {
  const version = trackingVersion;
  const sourceDead = isDisposedNode(source);
  const consumerDead = isDisposedNode(consumer);

  if (sourceDead || consumerDead) {
    if (__DEV__) {
      devAssertTrackReadAlive(sourceDead, consumerDead);
    }

    return;
  }

  if (__DEV__) {
    devRecordTrackRead(context, consumer, source);
  }

  const prevEdge = consumer.depsTail;
  if (prevEdge === null) {
    const firstIn = consumer.firstIn;

    if (firstIn === null) {
      consumer.depsTail = linkEdge(source, consumer, null, version);
      return;
    }

    if (firstIn.from === source) {
      firstIn.version = version;
      consumer.depsTail = firstIn;
      return;
    }

    if (firstIn.nextIn === null) {
      consumer.depsTail = linkEdge(source, consumer, null, version);
      return;
    }

    consumer.depsTail = (context.trackReadFallback ?? trackReadFallback)(
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
    consumer.depsTail = linkEdge(source, consumer, prevEdge, version);
    return;
  }

  if (nextExpected.from === source) {
    nextExpected.version = version;
    consumer.depsTail = nextExpected;
    return;
  }

  if (nextExpected.nextIn === null) {
    consumer.depsTail = linkEdge(source, consumer, prevEdge, version);
    return;
  }

  consumer.depsTail = (context.trackReadFallback ?? trackReadFallback)(
    source,
    consumer,
    prevEdge,
    nextExpected,
    version,
  );
}

/**
 * Suffix cleanup over the consumer's incoming edges after recompute.
 * Everything after depsTail belongs to the old dependency list and is unlinked.
 */
export function cleanupStaleSources(node: ReactiveNode): void {
  const tail = node.depsTail;
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
