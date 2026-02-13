import { linkSourceToObserverUnsafe } from "@reflex/core";
import type { ReactiveNode } from "../shape/ReactiveNode";
import { currentComputation } from "../../execution";
import { isNodeStale, recompute } from "../walkers/ensureFresh";

// @__INLINE__
export function readSignal<T>(node: ReactiveNode<T>) {
  const current = currentComputation();

  if (current) {
    linkSourceToObserverUnsafe(node, current);
  }

  return node.payload;
}

// @__INLINE__
export function readComputed<T>(node: ReactiveNode<T>): T {
  const current = currentComputation();

  if (current) {
    linkSourceToObserverUnsafe(node, current);
  }

  if (node.payload === null || isNodeStale(node)) {
    recompute(node);
  }

  return node.payload;
}
