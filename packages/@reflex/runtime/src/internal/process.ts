import { ReactiveNode, ReactiveNodeKind } from "../reactivity";
import runtime from "../reactivity/context";

export function getCurrentComputedInternal(): ReactiveNode | undefined {
  const node = runtime.activeComputed;

  return node
    ? (node.kind & ReactiveNodeKind.Computed) !== 0
      ? node
      : undefined
    : undefined;
}
