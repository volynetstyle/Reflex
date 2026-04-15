import type { ReactiveNode } from "../reactivity";
import { activeComputed, ReactiveNodeState } from "../reactivity";

export function getCurrentComputedInternal(): ReactiveNode | undefined {
  const node = activeComputed;

  return node
    ? !(node.state & ReactiveNodeState.Consumer)
      ? node
      : undefined
    : undefined;
}
