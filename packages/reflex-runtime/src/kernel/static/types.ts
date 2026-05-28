import type { ReactiveNode } from "../shape";

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
