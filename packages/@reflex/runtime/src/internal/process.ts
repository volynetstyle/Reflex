import { ReactiveNode, ReactiveNodeState } from "../reactivity";
import runtime from "../reactivity/context";

export function getCurrentComputedInternal(): ReactiveNode | undefined {
  const node = runtime.activeComputed;

  return node
    ? !(node.state & ReactiveNodeState.Consumer)
      ? node
      : undefined
    : undefined;
}
