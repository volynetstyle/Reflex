import type { ReactiveNode } from "../shape";

export interface NodeTopologySnapshot {
  node: ReactiveNode;
  s: number;
}

export function createSnapshots(
  nodes: readonly ReactiveNode[],
): NodeTopologySnapshot[] {
  const snapshots: NodeTopologySnapshot[] = new Array(nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    snapshots[i] = {
      node,
      s: node.s,
    };
  }

  return snapshots;
}
