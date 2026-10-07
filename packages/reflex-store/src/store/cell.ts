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
  peek(): T;
  collect(): void;
  dispose(): void;
  [Symbol.dispose](): void;
}

/** Compiler target: a direct leaf address, materialized only by a tracked read. */
export function createStoreCell<T>(
  initial: T,
  options?: { name?: string },
): StoreCell<T> {
  let value = initial;
  let node: ProducerNode<number> | undefined;
  let disposed = false;
  const cell = (() => {
    if (disposed) throw new Error("Cannot use a disposed store cell");
    if (currentConsumer === null) return value;
    readProducer((node ??= createProducer(0)));
    return value;
  }) as StoreCell<T>;
  cell.peek = () => {
    if (disposed) throw new Error("Cannot use a disposed store cell");
    return value;
  };
  cell.set = (next) => {
    if (disposed) throw new Error("Cannot use a disposed store cell");
    if (Object.is(value, next)) return;
    value = next;
    if (node) writeProducer(node, node.payload + 1);
  };
  cell.collect = () => {
    if (!node || node.firstOut !== null) return;
    disposeNode(node);
    node = undefined;
  };
  cell[Symbol.dispose] = () => cell.dispose();
  cell.dispose = () => {
    disposed = true;
    if (node) disposeNode(node);
    node = undefined;
    value = undefined as T;
  };
  setStoreName(cell, options?.name);
  return cell;
}
