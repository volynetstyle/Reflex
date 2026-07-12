import type { ReactiveEdge } from "./edge";
import { isPayload } from "./node.dev";

export type ComputeFn<T> = (() => T) | undefined;
export type WatcherCleanup = () => void;
export type WatcherResult = void | WatcherCleanup;

declare const reactiveNodeRole: unique symbol;

class ReactiveNode<T = unknown> {
  state: number = 0;
  firstOut: ReactiveEdge | null = null;
  lastOut: ReactiveEdge | null = null;
  firstIn: ReactiveEdge | null = null;
  lastIn: ReactiveEdge | null = null;
  tailIn: ReactiveEdge | null = null;
  compute: ComputeFn<T> = undefined;
  payload: T;

  constructor(payload: T, compute: ComputeFn<T>, state: number) {
    if (__DEV__ && !isPayload(payload)) {
      throw new TypeError(
        `[ReactiveNode(constructor)]: payload must be primitive, function, array, or plain object, but not a ${typeof payload}`,
      );
    }

    this.state = state | 0;
    this.compute = compute;
    this.payload = payload;
  }
}

type NodeRole<Role extends string> = {
  readonly [reactiveNodeRole]: Role;
};

export type ProducerNode<T> = ReactiveNode<T> &
  NodeRole<"producer"> & {
    compute: undefined;
  };

export type ConsumerNode<T> = ReactiveNode<T> &
  NodeRole<"consumer"> & {
    compute: () => T;
  };

export type WatcherNode = ReactiveNode<WatcherResult> &
  NodeRole<"watcher"> & {
    compute: (() => WatcherResult) | undefined;
  };

export default ReactiveNode;
