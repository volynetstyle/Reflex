import {
  ReactiveNode as RuntimeReactiveNode,
  PRODUCER_INITIAL_STATE,
  WATCHER_INITIAL_STATE,
  CONSUMER_INITIAL_STATE,
} from "@reflex/runtime";
import type { ReactiveEdge, ReactiveNode } from "@reflex/runtime";
import { EventSource as RuntimeEventSource } from "./event";
import {
  bindWatcherToRuntime,
  getCurrentRuntimeBinding,
  getDefaultRuntimeBinding,
  withRuntimeBinding,
} from "./runtime.binding";

export class RankedEffectNode<T = unknown> implements ReactiveNode<T> {
  state: number;
  firstOut: ReactiveEdge | null;
  firstIn: ReactiveEdge | null;
  lastOut: ReactiveEdge | null;
  lastIn: ReactiveEdge | null;
  lastOutTail: ReactiveEdge | null;

  compute: (() => T) | null;
  payload: T;

  priority?: number;
  rank?: number;
  rankedPriority: number;
  nextRanked: RankedEffectNode | undefined;
  prevRanked: RankedEffectNode;

  constructor(
    payload: T,
    compute: (() => T) | null,
    state: number,
    priority: number = 0,
  ) {
    this.state = state | 0;
    this.firstOut = null;
    this.firstIn = null;
    this.lastOut = null;
    this.lastIn = null;
    this.lastOutTail = null;

    this.compute = compute;
    this.payload = payload as T;

    this.priority = priority;
    this.rank = 0;
    this.rankedPriority = 0;
    this.nextRanked = undefined;
    this.prevRanked = undefined as unknown as RankedEffectNode;
  }
}

export const createWatcherRankedrNode = (
  compute: EffectFn,
  priority = 0,
): ReactiveNode => {
  const runtime = getCurrentRuntimeBinding() ?? getDefaultRuntimeBinding();
  const boundCompute =
    runtime === null ? compute : () => withRuntimeBinding(runtime, compute);
  const node = new RankedEffectNode(
    undefined,
    boundCompute,
    WATCHER_INITIAL_STATE,
    priority,
  );

  bindWatcherToRuntime(node, runtime);
  return node;
};

export const createSignalNode = <T>(payload: T) => {
  return new RuntimeReactiveNode<T>(
    payload,
    /*TODO: replace with undefined*/ null,
    PRODUCER_INITIAL_STATE,
  );
};

export const createSource = <T>(): RuntimeEventSource<T> => {
  return new RuntimeEventSource<T>();
};

export const createResourceStateNode = () => {
  return new RuntimeReactiveNode<number>(
    0,
    /*TODO: replace with undefined*/ null,
    PRODUCER_INITIAL_STATE,
  );
};

export const createAccumulator = <T>(payload: T): ReactiveNode<T> => {
  return new RuntimeReactiveNode(
    payload,
    /*TODO: replace with undefined*/ null,
    PRODUCER_INITIAL_STATE,
  );
};

export const createComputedNode = <T>(fn: () => T) => {
  const runtime = getCurrentRuntimeBinding() ?? getDefaultRuntimeBinding();
  const compute = runtime === null ? fn : () => withRuntimeBinding(runtime, fn);

  return new RuntimeReactiveNode<T>(
    undefined as T,
    compute,
    CONSUMER_INITIAL_STATE,
  );
};

export const createWatcherNode = (compute: EffectFn): ReactiveNode => {
  const runtime = getCurrentRuntimeBinding() ?? getDefaultRuntimeBinding();
  const boundCompute =
    runtime === null ? compute : () => withRuntimeBinding(runtime, compute);
  const node = new RuntimeReactiveNode(
    undefined,
    boundCompute,
    WATCHER_INITIAL_STATE,
  );

  bindWatcherToRuntime(node, runtime);
  return node;
};
