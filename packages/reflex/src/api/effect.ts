import {
  runWatcher,
  disposeWatcher,
  ReactiveNode,
} from "@reflex/runtime";
import { ReactiveNodeState } from "../../../@reflex/runtime/src/reactivity/shape/ReactiveMeta";
import { createEffectNode } from "../infra";

export function effectScheduled(
  node: ReactiveNode<Destructor | null>,
) {
  node.state |= ReactiveNodeState.Scheduled;
}

export function effectUnscheduled(
  node: ReactiveNode<Destructor | null>,
) {
  node.state &= ~ReactiveNodeState.Scheduled;
}

export interface EffectScope {
  (): void;
  dispose(): void;
}

export function effect(fn: EffectFn): EffectScope {
  const node = createEffectNode(fn);
  runWatcher(node);

  const scope = function (): void {
    disposeWatcher(node);
  } as EffectScope;

  scope.dispose = scope;

  return scope;
}
