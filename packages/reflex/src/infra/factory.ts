import {
  ReactiveNode,
  EventSource,
  PRODUCER_INITIAL_STATE,
  CONSUMER_INITIAL_STATE,
  WATCHER_INITIAL_STATE,
} from "@reflex/runtime";

export const UNINITIALIZED = Symbol("UNINITIALIZED") as unknown;

export function createSignalNode<T>(payload: T): ReactiveNode<T> {
  return new ReactiveNode(payload, null, PRODUCER_INITIAL_STATE);
}

export function createSource<T>(): EventSource<T> {
  return new EventSource<T>();
}

export function createAccumulator<T>(payload: T): ReactiveNode<T> {
  return new ReactiveNode(payload, null, PRODUCER_INITIAL_STATE);
}

export function createComputedNode<T>(compute: () => T): ReactiveNode<T> {
  return new ReactiveNode(UNINITIALIZED as T, compute, CONSUMER_INITIAL_STATE);
}

export function createEffectNode(compute: EffectFn): ReactiveNode {
  return new ReactiveNode(null, compute, WATCHER_INITIAL_STATE);
}
