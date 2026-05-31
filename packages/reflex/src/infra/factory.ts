import {
  ReactiveNode as RuntimeReactiveNode,
  PRODUCER_INITIAL_STATE,
  WATCHER_INITIAL_STATE,
  CONSUMER_INITIAL_STATE,
  setNodeGraphReductionPolicy,
  type GraphReductionOptions,
} from "@volynets/reflex-runtime/internal";
import type { ReactiveNode } from "@volynets/reflex-runtime/internal";
import { EventSource as RuntimeEventSource } from "./event";

export const createWatcherRankedrNode = (
  compute: EffectFn,
  priority = 0,
): ReactiveNode => {
  const node = new RuntimeReactiveNode(
    undefined,
    compute,
    WATCHER_INITIAL_STATE,
  ) as ReactiveNode & { priority?: number };

  node.priority = priority;
  return node;
};

export const createSignalNode = <T>(payload: T) => {
  return new RuntimeReactiveNode<T>(payload, null, PRODUCER_INITIAL_STATE);
};

export const createSource = <T>(): RuntimeEventSource<T> => {
  return new RuntimeEventSource<T>();
};

export const createResourceStateNode = () => {
  return new RuntimeReactiveNode<number>(0, null, PRODUCER_INITIAL_STATE);
};

export const createAccumulator = <T>(payload: T): ReactiveNode<T> => {
  return new RuntimeReactiveNode(payload, null, PRODUCER_INITIAL_STATE);
};

export const createComputedNode = <T>(
  fn: () => T,
  graphReductionPolicy?: GraphReductionOptions,
) => {
  const node = new RuntimeReactiveNode<T>(
    undefined as T,
    fn,
    CONSUMER_INITIAL_STATE,
  );

  if (graphReductionPolicy !== undefined) {
    setNodeGraphReductionPolicy(node, graphReductionPolicy);
  }

  return node;
};

export const createWatcherNode = (compute: EffectFn): ReactiveNode => {
  return new RuntimeReactiveNode(
    undefined,
    compute,
    WATCHER_INITIAL_STATE,
  );
};
