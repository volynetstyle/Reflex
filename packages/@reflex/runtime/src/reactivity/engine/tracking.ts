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
import { defaultContext, trackReadFallback } from "../context";
import { runtimePerfCounters } from "../perf";

/**
 * Cursor-guided incoming-edge walk used during dependency collection.
 * It first probes the hot cache and expected next edge, then falls back to a
 * linear scan that reorders the found edge into the reused dependency prefix.
 */
export function trackRead(source: ReactiveNode): void {
  const context = defaultContext;
  const consumer = context.activeComputed;

  if (!consumer) return;
  trackReadActive(source, consumer);
}

export function trackReadActive(
  source: ReactiveNode,
  consumer: ReactiveNode,
): void {
  const perf = runtimePerfCounters;
  if (perf !== null) {
    perf.trackReadCalls += 1;
    perf.trackReadWhileActive += 1;
  }

  const sourceDead = isDisposedNode(source);
  const consumerDead = isDisposedNode(consumer);
  if (sourceDead || consumerDead) {
    if (perf !== null) {
      perf.trackReadDisposedSkip += 1;
    }

    if (__DEV__) {
      devAssertTrackReadAlive(sourceDead, consumerDead);
    }

    return;
  }

  if (__DEV__) {
    devRecordTrackRead(defaultContext, consumer, source);
  }

  const prevEdge = consumer.depsTail;
  if (prevEdge === null) {
    const firstIn = consumer.firstIn;

    if (firstIn === null) {
      if (perf !== null) {
        perf.trackReadNewEdge += 1;
      }
      consumer.depsTail = linkEdge(source, consumer, null);
      return;
    }

    if (firstIn.from === source) {
      consumer.depsTail = firstIn;
      return;
    }

    if (firstIn.nextIn === null) {
      if (perf !== null) {
        perf.trackReadNewEdge += 1;
      }
      consumer.depsTail = linkEdge(source, consumer, null);
      return;
    }

    if (perf !== null) {
      perf.trackReadFallbackScan += 1;
    }
    consumer.depsTail = trackReadFallback(source, consumer, null, firstIn);
    return;
  }

  if (prevEdge.from === source) {
    if (perf !== null) {
      perf.trackReadDuplicateSourceHit += 1;
    }
    return;
  }

  const nextExpected = prevEdge.nextIn;
  if (nextExpected === null) {
    if (perf !== null) {
      perf.trackReadNewEdge += 1;
    }
    consumer.depsTail = linkEdge(source, consumer, prevEdge);
    return;
  }

  if (nextExpected.from === source) {
    if (perf !== null) {
      perf.trackReadExpectedEdgeHit += 1;
    }
    consumer.depsTail = nextExpected;
    return;
  }

  if (nextExpected.nextIn === null) {
    if (perf !== null) {
      perf.trackReadNewEdge += 1;
    }
    consumer.depsTail = linkEdge(source, consumer, prevEdge);
    return;
  }

  if (perf !== null) {
    perf.trackReadFallbackScan += 1;
  }
  consumer.depsTail = trackReadFallback(
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
  const perf = runtimePerfCounters;
  if (perf !== null) {
    perf.cleanupPassCount += 1;
  }

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

  if (perf !== null) {
    let removedCount = 0;
    for (
      let edge: typeof detachedStaleHead | null = detachedStaleHead;
      edge !== null;
      edge = edge.nextIn
    ) {
      removedCount += 1;
    }
    perf.cleanupStaleEdgeCount += removedCount;
  }

  unlinkDetachedIncomingEdgeSequence(detachedStaleHead);
}
