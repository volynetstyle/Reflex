import {
  createProducer,
  type ProducerNode,
} from "@volynets/reflex-runtime/internal";

export function createSignalNode<T>(payload: T): ProducerNode<T> {
  return createProducer(payload);
}
