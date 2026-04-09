import {
  ReactiveNode as RuntimeReactiveNode,
  PRODUCER_INITIAL_STATE,
  WATCHER_INITIAL_STATE,
  CONSUMER_INITIAL_STATE,
} from "@reflex/runtime";
import type { ReactiveNode } from "@reflex/runtime";
import { EventSource as RuntimeEventSource } from "./event";

export const UNINITIALIZED = Symbol("UNINITIALIZED") as unknown;

export function createSignalNode<T>(payload: T) {
  return new RuntimeReactiveNode<T>(
    payload,
    /*TODO: replace with undefined*/ null,
    PRODUCER_INITIAL_STATE,
  );
}

export function createSource<T>(): RuntimeEventSource<T> {
  return new RuntimeEventSource<T>();
}

export function createResourceStateNode() {
  return new RuntimeReactiveNode<number>(
    0,
    /*TODO: replace with undefined*/ null,
    PRODUCER_INITIAL_STATE,
  );
}

export function createAccumulator<T>(payload: T): ReactiveNode<T> {
  return new RuntimeReactiveNode(
    payload,
    /*TODO: replace with undefined*/ null,
    PRODUCER_INITIAL_STATE,
  );
}

export function createComputedNode<T>(fn: () => T) {
  return new RuntimeReactiveNode<T>(undefined as T, fn, CONSUMER_INITIAL_STATE);
}

export function createWatcherNode(compute: EffectFn): ReactiveNode {
  return new RuntimeReactiveNode(undefined, compute, WATCHER_INITIAL_STATE);
}
