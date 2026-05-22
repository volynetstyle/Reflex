import { compare as defaultCompare } from "../protocol/utils/compare";
import { recompute } from "./engine";
import { notifyWatcher } from "./walkers/invalidateBranch";
import { Changed, Consumer, Watcher, type ReactiveNode } from "./shape";

export interface TopologyGuard {
  validate(): boolean;
  validateRange(
    nodeStart: number,
    nodeEnd: number,
    sinkStart: number,
    sinkEnd: number,
  ): boolean;
}

export interface StaticPlanRange {
  source: ReactiveNode;
  nodeStart: number;
  nodeEnd: number;
  sinkStart: number;
  sinkEnd: number;
}

export interface StaticTransitionPlan {
  sources: ReactiveNode[];
  nodes: ReactiveNode[];
  sinks: ReactiveNode[];
  versions: number[];
  ranges: StaticPlanRange[];
  guard: TopologyGuard;
}

interface NodeTopologySnapshot {
  node: ReactiveNode;
  topologyVersion: number;
}

class StaticTopologyGuard implements TopologyGuard {
  constructor(
    private readonly nodes: NodeTopologySnapshot[],
    private readonly sinks: NodeTopologySnapshot[],
  ) {}

  validate(): boolean {
    return this.validateRange(0, this.nodes.length, 0, this.sinks.length);
  }

  validateRange(
    nodeStart: number,
    nodeEnd: number,
    sinkStart: number,
    sinkEnd: number,
  ): boolean {
    for (let i = nodeStart; i < nodeEnd; i++) {
      const snapshot = this.nodes[i]!;
      if (snapshot.node.topologyVersion !== snapshot.topologyVersion) {
        return false;
      }
    }

    for (let i = sinkStart; i < sinkEnd; i++) {
      const snapshot = this.sinks[i]!;
      if (snapshot.node.topologyVersion !== snapshot.topologyVersion) {
        return false;
      }
    }

    return true;
  }
}

function pushUnique(nodes: ReactiveNode[], node: ReactiveNode): void {
  if (nodes.includes(node)) return;
  nodes.push(node);
}

function collectStaticPlanNodes(
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

function createTopologicalNodeOrder(
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

function createSnapshots(
  nodes: readonly ReactiveNode[],
): NodeTopologySnapshot[] {
  const snapshots: NodeTopologySnapshot[] = new Array(nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    snapshots[i] = {
      node,
      topologyVersion: node.topologyVersion,
    };
  }

  return snapshots;
}

function createSourceRange(
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

function findSourceRange(
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

export function recomputeStaticNode(node: ReactiveNode): boolean {
  return recompute(node);
}

export function notifyStaticSink(node: ReactiveNode): void {
  node.state = (node.state & ~Changed) | Changed;
  notifyWatcher(node);
}

export function executeStaticPlan(plan: StaticTransitionPlan): boolean {
  return executeStaticPlanRange(plan, {
    source: plan.sources[0]!,
    nodeStart: 0,
    nodeEnd: plan.nodes.length,
    sinkStart: 0,
    sinkEnd: plan.sinks.length,
  });
}

export function executeStaticPlanRange(
  plan: StaticTransitionPlan,
  range: StaticPlanRange,
): boolean {
  if (
    !plan.guard.validateRange(
      range.nodeStart,
      range.nodeEnd,
      range.sinkStart,
      range.sinkEnd,
    )
  ) {
    return false;
  }

  for (let i = range.nodeStart; i < range.nodeEnd; i++) {
    recomputeStaticNode(plan.nodes[i]!);
    plan.versions[i] = (plan.versions[i]! + 1) >>> 0;
  }

  if (
    !plan.guard.validateRange(
      range.nodeStart,
      range.nodeEnd,
      range.sinkStart,
      range.sinkEnd,
    )
  ) {
    return false;
  }

  const offset = plan.nodes.length;
  for (let i = range.sinkStart; i < range.sinkEnd; i++) {
    notifyStaticSink(plan.sinks[i]!);
    plan.versions[offset + i] = (plan.versions[offset + i]! + 1) >>> 0;
  }

  return plan.guard.validateRange(
    range.nodeStart,
    range.nodeEnd,
    range.sinkStart,
    range.sinkEnd,
  );
}

export function writeStaticPlanSource<T>(
  plan: StaticTransitionPlan,
  source: ReactiveNode<T>,
  value: T,
  compare: (prev: T, next: T) => boolean = defaultCompare,
): boolean {
  const prev = source.payload;

  if (compare(prev, value)) return true;

  source.payload = value;

  return executeStaticPlanRange(plan, findSourceRange(plan, source));
}
