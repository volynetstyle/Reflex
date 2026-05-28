import { Consumer, Watcher, type ReactiveNode } from "../shape";

export function pushUnique(nodes: ReactiveNode[], node: ReactiveNode): void {
  if (nodes.includes(node)) return;
  nodes.push(node);
}

export function collectStaticPlanNodes(
  source: ReactiveNode,
  reachableNodes: Set<ReactiveNode>,
  reachableSinks: Set<ReactiveNode>,
): void {
  const queue: ReactiveNode[] = [];
  const seen = new Set<ReactiveNode>();
  let cursor = 0;

  for (let edge = source.firstOut; edge !== null; edge = edge.nextOut) {
    queue.push(edge.to);
  }

  while (cursor < queue.length) {
    const node = queue[cursor++]!;

    if (seen.has(node)) continue;
    seen.add(node);

    if ((node.state & Watcher) !== 0) {
      reachableSinks.add(node);
      continue;
    }

    if ((node.state & Consumer) !== 0 || node.compute !== null) {
      reachableNodes.add(node);
    }

    for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
      queue.push(edge.to);
    }
  }
}

export function createTopologicalNodeOrder(
  reachableNodes: ReadonlySet<ReactiveNode>,
): ReactiveNode[] {
  const pending = new Map<ReactiveNode, number>();
  const order: ReactiveNode[] = [];
  const queue: ReactiveNode[] = [];

  for (const node of reachableNodes) {
    let count = 0;

    for (let edge = node.firstIn; edge !== null; edge = edge.nextIn) {
      if (reachableNodes.has(edge.from)) {
        count += 1;
      }
    }

    pending.set(node, count);
    if (count === 0) queue.push(node);
  }

  let cursor = 0;
  while (cursor < queue.length) {
    const node = queue[cursor++]!;
    order.push(node);

    for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
      const sub = edge.to;
      const count = pending.get(sub);

      if (count === undefined) continue;

      const next = count - 1;
      pending.set(sub, next);
      if (next === 0) queue.push(sub);
    }
  }

  return order.length === reachableNodes.size
    ? order
    : Array.from(reachableNodes);
}
