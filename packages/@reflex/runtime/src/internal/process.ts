import type { ReactiveNode } from "../reactivity";
import { ReactiveNodeState } from "../reactivity";
import type { ExecutionContext } from "../reactivity/context";

export function getCurrentComputedInternal(
  context: ExecutionContext,
): ReactiveNode | undefined {
  const node = context.activeComputed;

  return node
    ? !(node.state & ReactiveNodeState.Consumer)
      ? node
      : undefined
    : undefined;
}
