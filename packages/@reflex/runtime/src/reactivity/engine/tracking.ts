import type ReactiveNode from "../shape/ReactiveNode";
import { isDisposedNode } from "../shape";
import {
  devAssertTrackReadAlive,
  devRecordCleanupStaleSources,
  devRecordTrackRead,
} from "../dev";
import {
  linkEdge,
  reuseOrCreateIncomingEdge,
  unlinkDetachedIncomingEdgeSequence,
} from "../shape/methods/connect";
import { defaultContext } from "../context";

/**
 * Cursor-guided incoming-edge walk used during dependency collection.
 * It first probes the hot cache and expected next edge, then falls back to a
 * linear scan that reorders the found edge into the reused dependency prefix.
 */
export function trackRead(
  source: ReactiveNode,
): void {
  const context = defaultContext;
  const consumer = context.activeComputed;

  if (!consumer) return;
  trackReadActive(source, consumer, context);
}

export function trackReadActive(
  source: ReactiveNode,
  consumer: ReactiveNode,
  context = defaultContext,
): void {
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
      consumer.depsTail = linkEdge(source, consumer, null);
      return;
    }

    if (firstIn.from === source) {
      consumer.depsTail = firstIn;
      return;
    }

    if (firstIn.nextIn === null) {
      consumer.depsTail = linkEdge(source, consumer, null);
      return;
    }

    consumer.depsTail = reuseOrCreateIncomingEdge(
      source,
      consumer,
      null,
      firstIn,
    );
    return;
  }

  if (prevEdge.from === source) return;

  const nextExpected = prevEdge.nextIn;
  if (nextExpected === null) {
    consumer.depsTail = linkEdge(source, consumer, prevEdge);
    return;
  }

  if (nextExpected.from === source) {
    consumer.depsTail = nextExpected;
    return;
  }

  if (nextExpected.nextIn === null) {
    consumer.depsTail = linkEdge(source, consumer, prevEdge);
    return;
  }

  consumer.depsTail = reuseOrCreateIncomingEdge(
    source,
    consumer,
    prevEdge,
    nextExpected,
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
