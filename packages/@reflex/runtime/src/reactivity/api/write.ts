import ReactiveNode from "../shape/ReactiveNode";

// @__INLINE__
export function commitSignal(node: ReactiveNode, next: unknown): boolean {
  if (Object.is(node.payload, next)) return false;

  node.payload = next;
  node.v++;
  node.root.t++;

  return true;
}

// @__INLINE__
export function writeSignal<T>(node: ReactiveNode<T>, value: T): boolean {
  if (!commitSignal(node, value)) return false;

  return true;
}
