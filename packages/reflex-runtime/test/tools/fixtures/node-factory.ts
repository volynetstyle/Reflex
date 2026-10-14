import {
  CONSUMER_INITIAL_STATE,
  PRODUCER_INITIAL_STATE,
  ReactiveNode,
  WATCHER_INITIAL_STATE,
  type ConsumerNode,
  type ProducerNode,
  type WatcherNode,
  type WatcherResult,
} from "../../../src/internal";
export function createProducer<T>(value: T): ProducerNode<T> {
  return new ReactiveNode<T>(
    value,
    undefined,
    PRODUCER_INITIAL_STATE,
  ) as ProducerNode<T>;
}

export function createConsumer<T>(compute: () => T): ConsumerNode<T> {
  return new ReactiveNode<T>(
    undefined as T,
    compute,
    CONSUMER_INITIAL_STATE,
  ) as ConsumerNode<T>;
}

export function createWatcher(
  compute: () => void | (() => void),
): WatcherNode {
  return new ReactiveNode<WatcherResult>(
    undefined,
    compute,
    WATCHER_INITIAL_STATE,
  ) as WatcherNode;
}

export function createRawNode(state: number): ReactiveNode {
  return new ReactiveNode(undefined, undefined, state);
}

