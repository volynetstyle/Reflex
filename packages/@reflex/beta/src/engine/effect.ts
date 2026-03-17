import {
  EngineContext,
  ReactiveNode,
  clearDirtyState,
  isDisposedState,
  ReactiveNodeState,
} from "../core";
import { unlinkAllSources } from "../graph";
import { executeNodeComputation } from "./execute";

export function runEffect(ctx: EngineContext, node: ReactiveNode): void {
  const compute = node.compute;
  if (!compute || isDisposedState(node.state)) return;

  const prevCleanup = node.payload as (() => void) | null;
  node.payload = null;

  prevCleanup?.();

  executeNodeComputation(ctx, node, (result) => {
    node.v = ctx.getEpoch();
    clearDirtyState(node);

    if (typeof result === "function") {
      node.payload = result as () => void;
    }
  });
}

export function disposeEffect(node: ReactiveNode): void {
  if (isDisposedState(node.state)) return;

  node.state |= ReactiveNodeState.Disposed;

  const cleanup = node.payload as (() => void) | null;
  node.payload = null;
  cleanup?.();

  unlinkAllSources(node);
}
