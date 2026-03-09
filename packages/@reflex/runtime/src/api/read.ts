import { establish_dependencies_add } from "../reactivity/shape/methods/connect";
import ReactiveNode from "../reactivity/shape/ReactiveNode";
import { isStaleTransitive } from "../reactivity/shape/ReactiveVersion";
import { pullAndRecompute } from "../reactivity/walkers/pullAndRecompute";
import runtime, { Traversal } from "../runtime";

/**
 * That`s for signal
 * Read is doing nothing but mark downstream and oriented to upstream for pending updates
 * @param node
 * @returns
 */
// @__INLINE__
export function readProducer<T>(node: ReactiveNode<T>): T {
  establish_dependencies_add(node);

  return <T>node.payload;
}

export function readConsumer<T>(node: ReactiveNode<T>): T {
  establish_dependencies_add(node);

  if (node.verifiedAt !== 0 && node.verifiedAt === Traversal.current) {
    return node.payload;
  }

  // Используем транзитивную проверку
  if (!isStaleTransitive(node)) {
    return node.payload;
  }

  pullAndRecompute(node);
  return node.payload as T;
}