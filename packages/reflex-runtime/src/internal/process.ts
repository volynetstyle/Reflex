import type { ReactiveNode } from "../reactivity";
import { activeConsumer, Watcher } from "../reactivity";

export function getCurrentComputedInternal(): ReactiveNode | undefined {
  const node = activeConsumer;

  return node
    ? node.compute !== null && (node.state & Watcher) === 0
      ? node
      : undefined
    : undefined;
}
