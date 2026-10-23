import {
  createConsumer,
  createProducer,
  createWatcher,
} from "@volynets/reflex-runtime/internal";
import type {
  ConsumerNode,
  ProducerNode,
  WatcherNode,
} from "@volynets/reflex-runtime/internal";
import { EventSource as RuntimeEventSource } from "./event";

export const createSource = <T>(): RuntimeEventSource<T> => {
  return new RuntimeEventSource<T>();
};

export const createResourceStateNode = (): ProducerNode<number> =>
  createProducer(0);

export const createAccumulator = <T>(payload: T): ProducerNode<T> =>
  createProducer(payload);

export const createSignalNode = createAccumulator;

export const createComputedNode = <T>(fn: () => T): ConsumerNode<T> =>
  createConsumer(fn);

export const createWatcherNode = (compute: EffectFn): WatcherNode =>
  createWatcher(compute);
