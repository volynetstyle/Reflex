import type { ReactiveNode } from "../reactivity";
import { activeConsumer, ReactiveNodeState } from "../reactivity";

export function getCurrentComputedInternal(): ReactiveNode | undefined {
  const node = activeConsumer;

  return node
    ? !(node.state & ReactiveNodeState.Consumer)
      ? node
      : undefined
    : undefined;
}
