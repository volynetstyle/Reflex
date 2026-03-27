import { ConsumerReadMode, readConsumer } from "@reflex/runtime";
import { createComputedNode } from "../infra";

export function computed<T>(fn: () => T): Accessor<T> {
  const node = createComputedNode(fn)
   return () => readConsumer(node);
}

export function memo<T>(fn: () => T): Accessor<T> {
  const node = createComputedNode(fn);
  readConsumer(node, ConsumerReadMode.eager);
  return () => readConsumer(node);
}
