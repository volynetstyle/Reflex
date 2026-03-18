import {
  EngineContext,
  ReactiveNode,
  isTrackingState,
  TRACKING_STATE,
  ReactiveNodeState,
} from "./core";
import { linkEdge, unlinkFromSource } from "./graph";

export function trackRead(
  ctx: EngineContext,
  source: ReactiveNode,
  //list: OrderList,
): void {
  const consumer = ctx.activeComputed!;
  const cachedEdge = consumer.lastTrackedEdge;

  if (
    cachedEdge &&
    cachedEdge.from === source &&
    cachedEdge.to === consumer &&
    consumer.incoming[cachedEdge.inIndex] === cachedEdge
  ) {
    cachedEdge.s = consumer.s;
    return;
  }

  const incoming = consumer.incoming;
  for (let i = 0; i < incoming.length; ++i) {
    const edge = incoming[i]!;
    if (edge.from === source) {
      edge.s = consumer.s;
      consumer.lastTrackedEdge = edge;
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
  const incoming = node.incoming;
  let hasStale = false;
  let nextIncomingIndex = 0;

  node.state &= ~TRACKING_STATE;

  for (let i = 0; i < incoming.length; ++i) {
    const edge = incoming[i]!;

    if (edge.s !== epoch) {
      unlinkFromSource(edge);
      edge.inIndex = -1;
      hasStale = true;
      continue;
    }

    if (nextIncomingIndex !== i) {
      incoming[nextIncomingIndex] = edge;
    }
    edge.inIndex = nextIncomingIndex;
    ++nextIncomingIndex;
  }

  incoming.length = nextIncomingIndex;

  if (!hasStale) {
    node.state |= ReactiveNodeState.Tracking;
  }

  if (
    node.lastTrackedEdge !== null &&
    node.incoming[node.lastTrackedEdge.inIndex] !== node.lastTrackedEdge
  ) {
    node.lastTrackedEdge = null;
  }
}
