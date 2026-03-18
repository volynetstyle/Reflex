import type ReactiveNode from "./shape/ReactiveNode";
import {
  ReactiveNodeState,
  getNodeContext,
  isTrackingState,
  TRACKING_STATE,
} from "./shape/ReactiveMeta";
import { linkEdge, unlinkFromSource } from "./shape/methods/connect";
import type { ReactiveEdge } from "./shape/ReactiveEdge";

export function trackRead(source: ReactiveNode): void {
  const consumer = getNodeContext(source).activeComputed;

  if (!consumer) return;

  for (let e = consumer.firstIn; e; e = e.nextIn) {
    if (e.from === source) {
      e.s = consumer.s;
      consumer.lastTrackedEdge = e;
      return;
    }
  }

  if (isTrackingState(consumer.state)) {
    consumer.state &= ~TRACKING_STATE;
  }

  const edge = linkEdge(source, consumer);
  edge.s = consumer.s;
  consumer.lastTrackedEdge = edge;
}

export function cleanupStaleSources(node: ReactiveNode): void {
  const epoch = node.s;
  let hasStale = false;
  let prevIn: ReactiveEdge | null = null;
  let e = node.firstIn;

  node.state &= ~TRACKING_STATE;

  while (e) {
    const next = e.nextIn;

    if (e.s !== epoch) {
      if (node.lastTrackedEdge === e) {
        node.lastTrackedEdge = null;
      }
      if (prevIn) prevIn.nextIn = next;
      else node.firstIn = next;

      unlinkFromSource(e);
      hasStale = true;
    } else {
      prevIn = e;
    }

    e = next;
  }

  if (!hasStale) {
    node.state |= ReactiveNodeState.Tracking;
  }
}
