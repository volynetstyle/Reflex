import type ReactiveNode from "../node";
import type { ReactiveEdge } from "../edge";

export function disposeNode(node: ReactiveNode): void {
  let edge = node.firstIn;

  node.tailIn = null;

  // Unlink all sources.
  if (edge !== null) {
    node.firstIn = null;
    node.lastIn = null;

    do {
      const next: ReactiveEdge | null = edge.nextIn;
      const from = edge.from;

      const prevOut = edge.prevOut;
      const nextOut = edge.nextOut;

      if (prevOut !== null) prevOut.nextOut = nextOut;
      else from.firstOut = nextOut;

      if (nextOut !== null) nextOut.prevOut = prevOut;
      else from.lastOut = prevOut;

      edge.prevIn = null;
      edge.nextIn = null;
      edge.prevOut = null;
      edge.nextOut = null;

      edge = next;
    } while (edge !== null);
  } else {
    node.lastIn = null;
  }

  edge = node.firstOut;

  // Unlink all subscribers.
  if (edge !== null) {
    node.firstOut = null;
    node.lastOut = null;

    do {
      const next: ReactiveEdge | null = edge.nextOut;
      const to = edge.to;

      const prevIn = edge.prevIn;
      const nextIn = edge.nextIn;

      if (to.tailIn === edge) {
        to.tailIn = prevIn;
      }

      if (prevIn !== null) prevIn.nextIn = nextIn;
      else to.firstIn = nextIn;

      if (nextIn !== null) nextIn.prevIn = prevIn;
      else to.lastIn = prevIn;

      edge.prevIn = null;
      edge.nextIn = null;
      edge.prevOut = null;
      edge.nextOut = null;

      edge = next;
    } while (edge !== null);
  } else {
    node.lastOut = null;
  }

  node.compute = undefined;
  node.payload = undefined;
}

export function disposeNodeEvent(node: ReactiveNode): void {
  disposeNode(node);
}
