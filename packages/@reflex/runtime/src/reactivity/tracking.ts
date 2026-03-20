import type ReactiveNode from "./shape/ReactiveNode";
import {
  ReactiveNodeState,
  getNodeContext,
  isTrackingState,
  TRACKING_STATE,
} from "./shape/ReactiveMeta";
import {
  linkEdge,
  moveIncomingEdgeAfter,
  unlinkEdge,
} from "./shape/methods/connect";
import type { ReactiveEdge } from "./shape/ReactiveEdge";

function markEdgeTracked(edge: ReactiveEdge, consumer: ReactiveNode): void {
  edge.s = consumer.s;
  consumer.depsTail = edge;
}

/**
 * Cursor-guided incoming-edge walk used during dependency collection.
 * It first probes the hot cache and expected next edge, then falls back to a
 * linear scan that reorders the found edge into the reused dependency prefix.
 */
export function trackRead(source: ReactiveNode): void {
  const consumer = getNodeContext(source).activeComputed;

  if (!consumer) return;

  const prevEdge = consumer.depsTail;
  if (prevEdge?.from === source) {
    markEdgeTracked(prevEdge, consumer);
    return;
  }

  const nextExpected = prevEdge ? prevEdge.nextIn : consumer.firstIn;
  if (nextExpected?.from === source) {
    markEdgeTracked(nextExpected, consumer);
    return;
  }

  for (let e = nextExpected ? nextExpected.nextIn : consumer.firstIn; e; e = e.nextIn) {
    if (e.from === source) {
      moveIncomingEdgeAfter(e, consumer, prevEdge);
      if (isTrackingState(consumer.state)) {
        consumer.state &= ~TRACKING_STATE;
      }
      markEdgeTracked(e, consumer);
      return;
    }
  }

  if (isTrackingState(consumer.state)) {
    consumer.state &= ~TRACKING_STATE;
  }

  const edge = linkEdge(source, consumer, prevEdge);
  markEdgeTracked(edge, consumer);
}

/**
 * Suffix cleanup over the consumer's incoming edges after recompute.
 * Everything after depsTail belongs to the old dependency list and is unlinked.
 */
export function cleanupStaleSources(node: ReactiveNode): void {
  node.state &= ~TRACKING_STATE;
  const tail = node.depsTail;
  let edge = tail ? tail.nextIn : node.firstIn;
  const hasStale = edge !== null;

  while (edge) {
    const next = edge.nextIn;
    unlinkEdge(edge);
    edge = next;
  }

  if (!hasStale) {
    node.state |= ReactiveNodeState.Tracking;
  }
}
