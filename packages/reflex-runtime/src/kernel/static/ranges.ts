import type { ReactiveNode } from "../shape";
import { collectStaticPlanNodes } from "./graph";
import type { StaticPlanRange, StaticTransitionPlan } from "./types";

export function createSourceRange(
  source: ReactiveNode,
  nodes: readonly ReactiveNode[],
  sinks: readonly ReactiveNode[],
): StaticPlanRange {
  const reachableNodes = new Set<ReactiveNode>();
  const reachableSinks = new Set<ReactiveNode>();
  let nodeStart = nodes.length;
  let nodeEnd = 0;
  let sinkStart = sinks.length;
  let sinkEnd = 0;

  collectStaticPlanNodes(source, reachableNodes, reachableSinks);

  for (let i = 0; i < nodes.length; i++) {
    if (!reachableNodes.has(nodes[i]!)) continue;

    if (i < nodeStart) nodeStart = i;
    nodeEnd = i + 1;
  }

  for (let i = 0; i < sinks.length; i++) {
    if (!reachableSinks.has(sinks[i]!)) continue;

    if (i < sinkStart) sinkStart = i;
    sinkEnd = i + 1;
  }

  if (nodeStart === nodes.length) nodeStart = nodeEnd;
  if (sinkStart === sinks.length) sinkStart = sinkEnd;

  return {
    source,
    nodeStart,
    nodeEnd,
    sinkStart,
    sinkEnd,
  };
}

export function findSourceRange(
  plan: StaticTransitionPlan,
  source: ReactiveNode,
): StaticPlanRange {
  for (let i = 0; i < plan.ranges.length; i++) {
    const range = plan.ranges[i]!;
    if (range.source === source) return range;
  }

  return {
    source,
    nodeStart: 0,
    nodeEnd: plan.nodes.length,
    sinkStart: 0,
    sinkEnd: plan.sinks.length,
  };
}
