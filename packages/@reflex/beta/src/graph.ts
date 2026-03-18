import { ReactiveNode, ReactiveEdge } from "./core.js";
//import { OrderList } from "./order.js";

export function linkEdge(from: ReactiveNode, to: ReactiveNode): ReactiveEdge {
  const edge = new ReactiveEdge(from, to);
  edge.outIndex = from.outgoing.length;
  from.outgoing.push(edge);
  edge.inIndex = to.incoming.length;
  to.incoming.push(edge);
  return edge;
}

export function unlinkEdge(edge: ReactiveEdge): void {
  unlinkFromSource(edge);
  unlinkFromTarget(edge);
}

export function unlinkFromSource(edge: ReactiveEdge): void {
  const from = edge.from;
  const outgoing = from.outgoing;
  const index = edge.outIndex;

  if (index < 0) return;

  const lastIndex = outgoing.length - 1;
  const last = outgoing[lastIndex]!;

  if (index !== lastIndex) {
    outgoing[index] = last;
    last.outIndex = index;
  }

  outgoing.pop();
  edge.outIndex = -1;
}

function unlinkFromTarget(edge: ReactiveEdge): void {
  const to = edge.to;
  const incoming = to.incoming;
  const index = edge.inIndex;

  if (index < 0) return;

  const lastIndex = incoming.length - 1;
  const last = incoming[lastIndex]!;

  if (index !== lastIndex) {
    incoming[index] = last;
    last.inIndex = index;
  }

  incoming.pop();
  edge.inIndex = -1;

  if (to.lastTrackedEdge === edge) {
    to.lastTrackedEdge = null;
  }
}

export function unlinkAllSources(node: ReactiveNode): void {
  const incoming = node.incoming;

  for (let i = incoming.length - 1; i >= 0; --i) {
    const edge = incoming[i]!;
    unlinkFromSource(edge);
    edge.inIndex = -1;
  }

  incoming.length = 0;
  node.lastTrackedEdge = null;
}

export function connect(
  parent: ReactiveNode,
  child: ReactiveNode,
  //list: OrderList,
): ReactiveEdge {
  const incoming = child.incoming;
  for (let i = 0; i < incoming.length; ++i) {
    const edge = incoming[i]!;
    if (edge.from === parent) return edge;
  }

  const edge = linkEdge(parent, child);

  // if (!list.before(parent, child)) {
  //   repairTopology(parent, child, list);
  // }

  return edge;
}

export function disconnect(parent: ReactiveNode, child: ReactiveNode): void {
  const incoming = child.incoming;
  for (let i = 0; i < incoming.length; ++i) {
    const edge = incoming[i]!;
    if (edge.from === parent) {
      unlinkEdge(edge);
      return;
    }
  }
}

// export function repairTopology(
//   parent: ReactiveNode,
//   child: ReactiveNode,
//   list: OrderList,
// ): void {
//   const threshold = parent.order;
//   const toMove: ReactiveNode[] = [];
//
//   let cur: ReactiveNode | null = child;
//   while (cur && cur.order <= threshold) {
//     toMove.push(cur);
//     cur = cur.next;
//   }
//
//   let insertAfter = parent;
//   for (const node of toMove) {
//     list.moveAfter(node, insertAfter);
//     insertAfter = node;
//   }
// }
