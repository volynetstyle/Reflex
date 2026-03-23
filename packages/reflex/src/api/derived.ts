import { readConsumer } from "@reflex/runtime";
import { createComputedNode } from "../infra";

export function computed<T>(fn: () => T): Accessor<T> {
  const node = createComputedNode(fn);
  const accessor: Accessor<T> = () => readConsumer(node);
  return accessor;
}

// rewrite with primitive like readConsumer(node, "eager")
export function memo<T>(fn: () => T): Accessor<T> {
  const c = computed(fn);
  c();
  return c;
}
