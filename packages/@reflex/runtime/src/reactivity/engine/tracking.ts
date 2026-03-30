import type { ExecutionContext } from "../context";
import type ReactiveNode from "../shape/ReactiveNode";
import { collectDebugNodeRefs, recordDebugEvent } from "../../debug";
import {
  linkEdge,
  reuseOrCreateIncomingEdge,
  unlinkDetachedIncomingEdgeSequence,
} from "../shape/methods/connect";
import { getDefaultContext } from "../context";

/**
 * Cursor-guided incoming-edge walk used during dependency collection.
 * It first probes the hot cache and expected next edge, then falls back to a
 * linear scan that reorders the found edge into the reused dependency prefix.
 */
export function trackRead(
  source: ReactiveNode,
  context: ExecutionContext = getDefaultContext(),
): void {
  const consumer = context.activeComputed;

  if (!consumer) return;

  if (__DEV__) {
    recordDebugEvent(context, "track:read", {
      consumer,
      source,
    });
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
  if (nextExpected !== null && nextExpected.from === source) {
    consumer.depsTail = nextExpected;
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
export function cleanupStaleSources(
  node: ReactiveNode,
  _context: ExecutionContext = getDefaultContext(),
): void {
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
    const removedSources = collectDebugNodeRefs(
      staleHead,
      (edge) => edge.from,
      (edge) => edge.nextIn,
    );

    recordDebugEvent(_context, "cleanup:stale-sources", {
      node,
      detail: {
        removedCount: removedSources.length,
        removedSources,
      },
    });
  }

  unlinkDetachedIncomingEdgeSequence(staleHead);
}
