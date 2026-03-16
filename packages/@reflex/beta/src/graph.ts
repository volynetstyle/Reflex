import { ReactiveNode, ReactiveEdge, ReactiveNodeState } from "./core.js";
//import { OrderList } from "./order.js";

// ─── link / unlink ────────────────────────────────────────────────────────────

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

  // видалити зі списку out-edges from
  let prevE: ReactiveEdge | null = null;
  for (let e = from.firstOut; e; e = e.nextOut) {
    if (e === edge) {
      if (prevE) prevE.nextOut = e.nextOut;
      else from.firstOut = e.nextOut;
      break;
    }
    prevE = e;
  }

  // видалити зі списку in-edges to
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

// ─── connect з topo repair ────────────────────────────────────────────────────

export function connect(
  parent: ReactiveNode,
  child: ReactiveNode,
  //list: OrderList,
): ReactiveEdge {
  // перевірити чи ребро вже є
  for (let e = child.firstIn; e; e = e.nextIn) {
    if (e.from === parent) return e;
  }

  const edge = linkEdge(parent, child);

  // if (!list.before(parent, child)) {
  //   repairTopology(parent, child, list);
  // }

  return edge;
}

export function disconnect(parent: ReactiveNode, child: ReactiveNode): void {
  for (let e = child.firstIn; e; e = e.nextIn) {
    if (e.from === parent) {
      unlinkEdge(e);
      return;
    }
  }
}

// // ─── topology repair (forward scan, без DFS) ─────────────────────────────────
// // O(span) де span = відстань між child і parent у topo list

// export function repairTopology(
//   parent: ReactiveNode,
//   child: ReactiveNode,
//   list: OrderList,
// ): void {
//   const threshold = parent.order;
//   const toMove: ReactiveNode[] = [];

//   let cur: ReactiveNode | null = child;
//   while (cur && cur.order <= threshold) {
//     toMove.push(cur);
//     cur = cur.next;
//   }

//   let insertAfter = parent;
//   for (const node of toMove) {
//     list.moveAfter(node, insertAfter);
//     insertAfter = node;
//   }
// }
