import {
  EngineContext,
  ReactiveEdge,
  ReactiveNode,
  isTrackingState,
  TRACKING_STATE,
} from "./core";

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

  const edge = new ReactiveEdge(source, consumer);
  edge.nextOut = source.firstOut;
  source.firstOut = edge;
  edge.nextIn = consumer.firstIn;
  consumer.firstIn = edge;
  edge.s = consumer.s;
}
