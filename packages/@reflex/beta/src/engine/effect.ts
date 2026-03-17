import { EngineContext, ReactiveNode, isDisposedState, isTrackingState, CLEANUP_STATE, ReactiveNodeState } from "../core";
import { invokeCompute } from "../engine";
import { unlinkAllSources } from "../graph";
import { cleanupStaleSources } from "../tracking";

export function runEffect(ctx: EngineContext, node: ReactiveNode): void {
  const compute = node.compute;
  if (!compute || isDisposedState(node.state)) return;

  const prevCleanup = node.value as (() => void) | null;
  node.value = null;

  prevCleanup?.();

  const stable = isTrackingState(node.state);
  ++node.s;

  const result = invokeCompute(ctx, node, compute);

  if (!stable || !isTrackingState(node.state)) {
    cleanupStaleSources(node);
  }

  node.v = ctx.getEpoch();
  node.state &= CLEANUP_STATE;

  if (typeof result === "function") {
    node.value = result as () => void;
  }
}

export function disposeEffect(node: ReactiveNode): void {
  if (isDisposedState(node.state)) return;

  node.state |= ReactiveNodeState.Disposed;

  const cleanup = node.value as (() => void) | null;
  node.value = null;
  cleanup?.();

  unlinkAllSources(node);
}
