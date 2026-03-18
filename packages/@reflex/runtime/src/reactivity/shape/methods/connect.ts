import { ReactiveEdge } from "../ReactiveEdge";
import ReactiveNode from "../ReactiveNode";
import { getNodeContext, isTrackingState, TRACKING_STATE } from "../ReactiveMeta";

export function linkEdge(from: ReactiveNode, to: ReactiveNode): ReactiveEdge {
  const edge = new ReactiveEdge(from, to);
  edge.nextOut = from.firstOut;
  from.firstOut = edge;
  edge.nextIn = to.firstIn;
  to.firstIn = edge;
  return edge;
}

export function unlinkEdge(edge: ReactiveEdge): void {
  const { from, to } = edge;

  let prevE: ReactiveEdge | null = null;
  for (let e = from.firstOut; e; e = e.nextOut) {
    if (e === edge) {
      if (prevE) prevE.nextOut = e.nextOut;
      else from.firstOut = e.nextOut;
      break;
    }
    prevE = e;
  }

  prevE = null;
  for (let e = to.firstIn; e; e = e.nextIn) {
    if (e === edge) {
      if (prevE) prevE.nextIn = e.nextIn;
      else to.firstIn = e.nextIn;
      break;
    }
    prevE = e;
  }
}

export function unlinkFromSource(edge: ReactiveEdge): void {
  const from = edge.from;

  let prevOut: ReactiveEdge | null = null;
  for (let e = from.firstOut; e; e = e.nextOut) {
    if (e === edge) {
      if (prevOut) prevOut.nextOut = e.nextOut;
      else from.firstOut = e.nextOut;
      return;
    }
    prevOut = e;
  }
}

export function unlinkAllSources(node: ReactiveNode): void {
  let edge = node.firstIn;
  node.firstIn = null;

  while (edge) {
    const next = edge.nextIn;
    unlinkFromSource(edge);
    edge.nextIn = null;
    edge.nextOut = null;
    edge = next;
  }
}

export function connect(parent: ReactiveNode, child: ReactiveNode): ReactiveEdge {
  for (let e = child.firstIn; e; e = e.nextIn) {
    if (e.from === parent) return e;
  }

  return linkEdge(parent, child);
}

export function disconnect(parent: ReactiveNode, child: ReactiveNode): void {
  for (let e = child.firstIn; e; e = e.nextIn) {
    if (e.from === parent) {
      unlinkEdge(e);
      return;
    }
  }
}

export function establish_dependencies_add(node: ReactiveNode): void {
  const consumer = getNodeContext(node).activeComputed;

  if (!consumer) return;

  const cachedEdge = consumer.lastTrackedEdge;
  if (cachedEdge?.from === node) {
    cachedEdge.s = consumer.s;
    return;
  }

  for (let e = consumer.firstIn; e; e = e.nextIn) {
    if (e.from === node) {
      e.s = consumer.s;
      consumer.lastTrackedEdge = e;
      return;
    }
  }

  if (isTrackingState(consumer.state)) {
    consumer.state &= ~TRACKING_STATE;
  }

  const edge = linkEdge(node, consumer);
  edge.s = consumer.s;
  consumer.lastTrackedEdge = edge;
}

export function clearDependencies(node: ReactiveNode): void {
  unlinkAllSources(node);
  node.lastTrackedEdge = null;
}
