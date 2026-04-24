import {
  ReactiveNode as RuntimeReactiveNode,
  PRODUCER_INITIAL_STATE,
  WATCHER_INITIAL_STATE,
  CONSUMER_INITIAL_STATE,
} from "@reflex/runtime";
import type { ReactiveEdge, ReactiveNode } from "@reflex/runtime";
import { EventSource as RuntimeEventSource } from "./event";

export class RankedEffectNode<T = unknown> implements ReactiveNode<T> {
  state: number;
  firstOut: ReactiveEdge | null;
  firstIn: ReactiveEdge | null;
  lastOut: ReactiveEdge | null;
  lastIn: ReactiveEdge | null;
  lastInTail: ReactiveEdge | null;
  outBranchCount: number =0;

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
    this.lastInTail = null;
    this.compute = compute;
    this.payload = payload as T;

    this.priority 
    = priority;
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
  return new RankedEffectNode(
    undefined,
    compute,
    WATCHER_INITIAL_STATE,
    priority,
  );
};

export const createSignalNode = <T>(payload: T) => {
  return new RuntimeReactiveNode<T>(
    payload,
    null,
    PRODUCER_INITIAL_STATE,
  );
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

export const createComputedNode = <T>(fn: () => T) => {
  return new RuntimeReactiveNode<T>(
    undefined as T,
    fn,
    CONSUMER_INITIAL_STATE,
  );
};

export const createWatcherNode = (compute: EffectFn): ReactiveNode => {
  return new RuntimeReactiveNode(undefined, compute, WATCHER_INITIAL_STATE);
};
