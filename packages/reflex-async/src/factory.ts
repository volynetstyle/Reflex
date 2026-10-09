import {
  ReactiveNode,
  PRODUCER_INITIAL_STATE,
  CONSUMER_INITIAL_STATE,
  WATCHER_INITIAL_STATE,
  type ConsumerNode,
  type ProducerNode,
  type WatcherNode,
} from "@volynets/reflex-runtime/internal";

// Keep the node shapes used by async sources independent of the Reflex facade.
export const createAccumulator = <T>(payload: T): ProducerNode<T> =>
  new ReactiveNode(
    payload,
    undefined,
    PRODUCER_INITIAL_STATE,
  ) as ProducerNode<T>;

export const createResourceStateNode = (): ProducerNode<number> =>
  createAccumulator(0);

export const createComputedNode = <T>(compute: () => T): ConsumerNode<T> =>
  new ReactiveNode(
    undefined as T,
    compute,
    CONSUMER_INITIAL_STATE,
  ) as ConsumerNode<T>;

export const createWatcherNode = (compute: () => void): WatcherNode =>
  new ReactiveNode(undefined, compute, WATCHER_INITIAL_STATE) as WatcherNode;
