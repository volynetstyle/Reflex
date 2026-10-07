import {
  createProducer,
  currentConsumer,
  disposeNode,
  readProducer,
  writeProducer,
  type ProducerNode,
} from "@volynets/reflex-runtime/internal";

import { setStoreName } from "../internal/names";

export interface StoreCell<T> {
  (): T;
  set(value: T): void;
  collect(): void;
  dispose(): void;
}

/** Compiler target: a direct leaf address, materialized only by a tracked read. */
export function createStoreCell<T>(
  initial: T,
  options: { name?: string } = {},
): StoreCell<T> {
  let value = initial;
  let node: ProducerNode<number> | undefined;
  let disposed = false;
  const assertLive = () => {
    if (disposed) throw new Error("Cannot use a disposed store cell");
  };
  const cell = Object.assign(
    () => {
      assertLive();
      if (currentConsumer === null) return value;
      node ??= createProducer(0);
      readProducer(node);
      return value;
    },
    {
      set(next: T) {
        assertLive();
        if (Object.is(value, next)) return;
        value = next;
        if (node) writeProducer(node, node.payload + 1);
      },
      collect() {
        if (!node || node.firstOut !== null) return;
        disposeNode(node);
        node = undefined;
      },
      dispose() {
        disposed = true;
        if (node) disposeNode(node);
        node = undefined;
        value = undefined as T;
      },
    },
  );
  setStoreName(cell, options.name);
  return cell;
}
