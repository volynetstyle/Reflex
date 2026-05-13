import type { ReactiveNode } from "../kernel";
import { activeConsumer, Watcher } from "../kernel";

export function getCurrentComputedInternal(): ReactiveNode | undefined {
  const node = activeConsumer;

  return node
    ? node.compute !== null && (node.state & Watcher) === 0
      ? node
      : undefined
    : undefined;
}
