import type { ReactiveNode } from "../shape";
import {
  collectStaticPlanNodes,
  createTopologicalNodeOrder,
  pushUnique,
} from "./graph";
import { createSourceRange } from "./ranges";
import { createSnapshots } from "./snapshots";
import { StaticTopologyGuard } from "./topologyGuard";
import type { StaticPlanRange, StaticTransitionPlan } from "./types";

export function createStaticTransitionPlan(
  sources: readonly ReactiveNode[],
): StaticTransitionPlan {
  const reachableNodes = new Set<ReactiveNode>();
  const reachableSinks = new Set<ReactiveNode>();

  for (let i = 0; i < sources.length; i++) {
    collectStaticPlanNodes(sources[i]!, reachableNodes, reachableSinks);
  }

  const nodes = createTopologicalNodeOrder(reachableNodes);
  const sinks: ReactiveNode[] = [];

  for (const node of nodes) {
    for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
      if (reachableSinks.has(edge.to)) pushUnique(sinks, edge.to);
    }
  }

  for (const sink of reachableSinks) pushUnique(sinks, sink);

  const ranges: StaticPlanRange[] = new Array(sources.length);

  for (let i = 0; i < sources.length; i++) {
    ranges[i] = createSourceRange(sources[i]!, nodes, sinks);
  }

  return {
    sources: Array.from(sources),
    nodes,
    sinks,
    versions: new Array(nodes.length + sinks.length).fill(0),
    ranges,
    guard: new StaticTopologyGuard(
      createSnapshots(nodes),
      createSnapshots(sinks),
    ),
  };
}
