import {
  EngineContext,
  ReactiveNode,
  CLEANUP_STATE,
  isTrackingState,
} from "../core";
import { invokeCompute } from "../engine";
import { cleanupStaleSources } from "../tracking";

function commitComputedValue(
  ctx: EngineContext,
  node: ReactiveNode,
  prevValue: unknown,
  newValue: unknown,
): boolean {
  node.value = newValue;
  node.v = ctx.getEpoch();
  node.state &= CLEANUP_STATE;

  const changed = !Object.is(prevValue, newValue);

  if (changed) {
    node.t = node.v;
  }

  return changed;
}

export function recompute(ctx: EngineContext, node: ReactiveNode): boolean {
  const compute = node.compute;
  if (!compute) return false;

  const stable = isTrackingState(node.state);
  ++node.s;

  const prevValue = node.value;
  const newValue = invokeCompute(ctx, node, compute);

  if (!stable || !isTrackingState(node.state)) {
    cleanupStaleSources(node);
  }

  return commitComputedValue(ctx, node, prevValue, newValue);
}
