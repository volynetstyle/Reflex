import {
  ReactiveNode as RuntimeReactiveNode,
  PRODUCER_INITIAL_STATE,
  CONSUMER_INITIAL_STATE,
  WATCHER_INITIAL_STATE,
} from "@reflex/runtime";
import type { ReactiveNode } from "@reflex/runtime";
import { EventSource as RuntimeEventSource } from "./event";

export const UNINITIALIZED = Symbol("UNINITIALIZED") as unknown;

export function createSignalNode<T>(payload: T): ReactiveNode<T> {
  return new RuntimeReactiveNode(payload, null, PRODUCER_INITIAL_STATE);
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

export function createComputedNode<T>(compute: () => T): ReactiveNode<T> {
  return new RuntimeReactiveNode(
    UNINITIALIZED as T,
    compute,
    CONSUMER_INITIAL_STATE,
  );
}

export function createWatcherNode(compute: EffectFn): ReactiveNode {
  return new RuntimeReactiveNode(null, compute, WATCHER_INITIAL_STATE);
}
