import { readConsumer } from "@reflex/runtime";
import { createComputedNode } from "../infra";

function createDerivedAccessor<T>(
  fn: () => T,
  mode: "lazy" | "eager" = "lazy",
): Accessor<T> {
  const node = createComputedNode(fn);

  if (mode === "eager") {
    readConsumer(node, "eager");
  }

  return () => readConsumer(node);
}

export function computed<T>(fn: () => T): Accessor<T> {
  return createDerivedAccessor(fn);
}

export function memo<T>(fn: () => T): Accessor<T> {
  return createDerivedAccessor(fn, "eager");
}
