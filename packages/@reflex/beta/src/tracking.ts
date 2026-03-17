import {
  EngineContext,
  ReactiveEdge,
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

  for (let e = consumer.firstIn; e; e = e.nextIn) {
    if (e.from === source) {
      e.s = consumer.s;
      return;
    }
  }

  if (isTrackingState(consumer.state)) {
    consumer.state &= ~TRACKING_STATE;
  }

  const edge = linkEdge(source, consumer);
  edge.s = consumer.s;
}

export function cleanupStaleSources(node: ReactiveNode): void {
  const epoch = node.s;
  let hasStale = false;
  let prevIn: ReactiveEdge | null = null;
  let e = node.firstIn;

  while (e) {
    const next = e.nextIn;

    if (e.s !== epoch) {
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
