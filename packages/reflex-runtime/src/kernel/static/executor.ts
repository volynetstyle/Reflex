import { compare as defaultCompare } from "../../protocol/utils/compare";
import { recompute } from "../engine";
import { emitSinkInvalidated } from "../execution";
import { Changed, type ReactiveNode } from "../shape";
import { findSourceRange } from "./ranges";
import type { StaticPlanRange, StaticTransitionPlan } from "./types";

export function recomputeStaticNode(node: ReactiveNode): boolean {
  return recompute(node);
}

export function notifyStaticSink(node: ReactiveNode): void {
  node.state = (node.state & ~Changed) | Changed;
  emitSinkInvalidated(node);
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
