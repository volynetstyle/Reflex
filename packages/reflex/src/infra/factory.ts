import {
  ReactiveNode as RuntimeReactiveNode,
  PRODUCER_INITIAL_STATE,
  CONSUMER_INITIAL_STATE,
  WATCHER_INITIAL_STATE,
  readConsumer,
  readProducer,
  ConsumerReadMode,
} from "@reflex/runtime";
import type { ReactiveNode } from "@reflex/runtime";
import { EventSource as RuntimeEventSource } from "./event";

export const UNINITIALIZED = Symbol("UNINITIALIZED") as unknown;

export function createSignalNode<T>(payload: T) {
  function accessor() {
    return readProducer(accessor);
  }

  accessor.payload = payload;
  accessor.state = PRODUCER_INITIAL_STATE;
  accessor.compute = null;
  accessor.firstIn = null;
  accessor.lastIn = null;
  accessor.firstOut = null;
  accessor.lastOut = null;
  accessor.depsTail = null;

  return accessor satisfies ReactiveNode<T>;
}

export function createSource<T>(): RuntimeEventSource<T> {
  return new RuntimeEventSource<T>();
}

export function createResourceStateNode() {
  return new RuntimeReactiveNode<number>(0, null, PRODUCER_INITIAL_STATE);
}

export function createAccumulator<T>(payload: T): ReactiveNode<T> {
  return new RuntimeReactiveNode(payload, null, PRODUCER_INITIAL_STATE);
}

export function createComputedNode<T>(fn: () => T) {
  function accessor(): T {
    return readConsumer(accessor, ConsumerReadMode.lazy);
  }

  accessor.payload = UNINITIALIZED as T;
  accessor.state = CONSUMER_INITIAL_STATE;
  accessor.compute = fn;
  accessor.firstIn = null;
  accessor.lastIn = null;
  accessor.firstOut = null;
  accessor.lastOut = null;
  accessor.depsTail = null;

  return accessor satisfies ReactiveNode<T>;
}

export function createWatcherNode(compute: EffectFn): ReactiveNode {
  return new RuntimeReactiveNode(null, compute, WATCHER_INITIAL_STATE);
}
