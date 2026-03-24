import { runWatcher, disposeWatcher, ReactiveNode, ReactiveNodeState } from "@reflex/runtime";
import { createEffectNode, UNINITIALIZED } from "../infra";

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

export function effect(fn: EffectFn): Effect<void> {
  const node = createEffectNode(fn);
  runWatcher(node);

  const scope = function (): void {
    disposeWatcher(node);
  } as Effect<void>;

  scope.dispose = scope;

  return scope;
}
