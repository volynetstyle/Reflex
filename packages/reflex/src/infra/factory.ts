import {
  ReactiveNode,
  PRODUCER_INITIAL_STATE,
  CONSUMER_INITIAL_STATE,
  RECYCLER_INITIAL_STATE,
  ReactiveEventSourceNode,
} from "@reflex/runtime";

export const UNINITIALIZED = Symbol("UNINITIALIZED") as unknown;

export function createSignalNode<T>(payload: T): ReactiveNode<T> {
  return new ReactiveNode(payload, null, PRODUCER_INITIAL_STATE);
}

export function createSource<T>(): ReactiveEventSourceNode<T> {
  return {
    head: null,
    tail: null,
  };
}

export function createScanNode<T>(payload: T): ReactiveNode<T> {
  return new ReactiveNode(payload, null, PRODUCER_INITIAL_STATE);
}

export function createComputedNode<T>(compute: () => T): ReactiveNode<T> {
  return new ReactiveNode(UNINITIALIZED as T, compute, CONSUMER_INITIAL_STATE);
}

export function createEffectNode(
  compute: EffectFn,
): ReactiveNode<Destructor | null> {
  return new ReactiveNode(null, compute, RECYCLER_INITIAL_STATE);
}
