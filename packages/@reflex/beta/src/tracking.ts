import {
  EngineContext,
  ReactiveEdge,
  ReactiveNode,
  ReactiveNodeState,
} from "./core";
import { connect, unlinkEdge, unlinkFromSource } from "./graph";

export function trackRead(
  ctx: EngineContext,
  source: ReactiveNode,
  //list: OrderList,
): void {
  const consumer = ctx.activeComputed!;

  for (let e = consumer.firstIn; e; e = e.nextIn) {
    if (e.from === source) {
      e.seenEpoch = consumer.trackEpoch;
      return;
    }
  }

  if (consumer.state & ReactiveNodeState.Tracking) {
    consumer.state &= ~ReactiveNodeState.Tracking;
  }

  const edge = connect(source, consumer);
  edge.seenEpoch = consumer.trackEpoch;
}

export function beginTracking(consumer: ReactiveNode): void {
  consumer.trackEpoch++;
}

export function finishTracking(consumer: ReactiveNode): void {
  const epoch = consumer.trackEpoch;
  let hasStale = false;
  let prevIn: ReactiveEdge | null = null;
  let e = consumer.firstIn;

  while (e) {
    const next = e.nextIn;

    if (e.seenEpoch !== epoch) {
      if (prevIn) prevIn.nextIn = next;
      else consumer.firstIn = next;

      unlinkFromSource(e);
      hasStale = true;
    } else {
      prevIn = e;
    }

    e = next;
  }

  if (!hasStale) {
    consumer.state |= ReactiveNodeState.Tracking;
  }
}
