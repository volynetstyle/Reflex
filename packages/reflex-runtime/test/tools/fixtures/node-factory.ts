import {
  CONSUMER_INITIAL_STATE,
  PRODUCER_INITIAL_STATE,
  ReactiveNode,
  WATCHER_INITIAL_STATE,
} from "../../../src/internal";
export function createProducer<T>(value: T): ReactiveNode<T> {
  return new ReactiveNode(value, null, PRODUCER_INITIAL_STATE);
}

export function createConsumer<T>(compute: () => T): ReactiveNode<T> {
  return new ReactiveNode(undefined as T, compute, CONSUMER_INITIAL_STATE);
}

export function createWatcher(
  compute: () => void | (() => void),
): ReactiveNode<unknown> {
  return new ReactiveNode(null, compute, WATCHER_INITIAL_STATE);
}

export function createRawNode(state: number): ReactiveNode {
  return new ReactiveNode(undefined, null, state);
}

