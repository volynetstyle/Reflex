import {
  ReactiveNode as RuntimeReactiveNode,
  PRODUCER_INITIAL_STATE,
  WATCHER_INITIAL_STATE,
  CONSUMER_INITIAL_STATE,
} from "@volynets/reflex-runtime/internal";
import type { ReactiveNode } from "@volynets/reflex-runtime/internal";
import { EventSource as RuntimeEventSource } from "./event";

export const createSource = <T>(): RuntimeEventSource<T> => {
  return new RuntimeEventSource<T>();
};

export const createResourceStateNode = () => {
  return new RuntimeReactiveNode<number>(0, undefined, PRODUCER_INITIAL_STATE);
};

export const createAccumulator = <T>(payload: T): ReactiveNode<T> => {
  return new RuntimeReactiveNode(payload, undefined, PRODUCER_INITIAL_STATE);
};

export const createSignalNode = createAccumulator;

export const createComputedNode = <T>(fn: () => T) => {
  const node = new RuntimeReactiveNode<T>(
    undefined as T,
    fn,
    CONSUMER_INITIAL_STATE,
  );

  return node;
};

export const createWatcherNode = (compute: EffectFn): ReactiveNode<any> => {
  return new RuntimeReactiveNode(undefined, compute, WATCHER_INITIAL_STATE);
};
