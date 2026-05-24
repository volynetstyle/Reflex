import type { ReactiveNode } from "../kernel";
import { currentConsumer, Watcher } from "../kernel";

export function getCurrentComputedInternal(): ReactiveNode | undefined {
  const node = currentConsumer;

  return node
    ? node.compute !== null && (node.state & Watcher) === 0
      ? node
      : undefined
    : undefined;
}
