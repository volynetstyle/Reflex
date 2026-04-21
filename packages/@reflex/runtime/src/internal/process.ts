import type { ReactiveNode } from "../reactivity";
import { activeConsumer, Consumer,  } from "../reactivity";

export function getCurrentComputedInternal(): ReactiveNode | undefined {
  const node = activeConsumer;

  return node
    ? !(node.state & Consumer)
      ? node
      : undefined
    : undefined;
}
