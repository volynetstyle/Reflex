import {
  ReactiveNode as RuntimeReactiveNode,
  PRODUCER_INITIAL_STATE,
  WATCHER_INITIAL_STATE,
  CONSUMER_INITIAL_STATE,
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
  new RuntimeReactiveNode<number>(
    0,
    undefined,
    PRODUCER_INITIAL_STATE,
  ) as ProducerNode<number>;

export const createAccumulator = <T>(payload: T): ProducerNode<T> =>
  new RuntimeReactiveNode(
    payload,
    undefined,
    PRODUCER_INITIAL_STATE,
  ) as ProducerNode<T>;

export const createSignalNode = createAccumulator;

export const createComputedNode = <T>(fn: () => T): ConsumerNode<T> => {
  const node = new RuntimeReactiveNode<T>(
    undefined as T,
    fn,
    CONSUMER_INITIAL_STATE,
  );

  return node as ConsumerNode<T>;
};

export const createWatcherNode = (compute: EffectFn): WatcherNode =>
  new RuntimeReactiveNode(
    undefined,
    compute,
    WATCHER_INITIAL_STATE,
  ) as WatcherNode;
