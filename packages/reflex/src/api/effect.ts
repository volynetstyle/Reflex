import { runWatcher, disposeWatcher, ReactiveNodeState } from "@reflex/runtime";
import { createEffectNode, UNINITIALIZED } from "../infra/factory";
import type { ReactiveNode } from "@reflex/runtime";

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

export function effect(fn: EffectFn):  Destructor {
  const node = createEffectNode(fn);
  runWatcher(node);

  return () => disposeWatcher(node);
}
