import {
  createConsumer,
  createProducer,
  createWatcher,
  type ConsumerNode,
  type ProducerNode,
  type WatcherNode,
} from "@volynets/reflex-runtime/internal";

// Async sources take the runtime factories so node shape and development
// diagnostics match every other node; the runtime owns the initial flags.
export const createAccumulator = <T>(payload: T): ProducerNode<T> =>
  createProducer(payload);

export const createResourceStateNode = (): ProducerNode<number> =>
  createAccumulator(0);

export const createComputedNode = <T>(compute: () => T): ConsumerNode<T> =>
  createConsumer(compute);

export const createWatcherNode = (compute: () => void): WatcherNode =>
  createWatcher(compute);
