import { runWatcher, disposeWatcher, ReactiveNodeState } from "@reflex/runtime";
import { createEffectNode, UNINITIALIZED } from "../infra/factory";
import type { ReactiveNode } from "../runtime-types";

export function effectScheduled(
  node: ReactiveNode<typeof UNINITIALIZED | Destructor>,
) {
  node.state |= ReactiveNodeState.Scheduled;
}

export function effectUnscheduled(
  node: ReactiveNode<typeof UNINITIALIZED | Destructor>,
) {
  node.state &= ~ReactiveNodeState.Scheduled;
}

export function effect(fn: EffectFn): Disposable {
  const node = createEffectNode(fn);
  runWatcher(node);

  const scope = function (): void {
    disposeWatcher(node);
  };

  scope.dispose = scope;

  return scope;
}
