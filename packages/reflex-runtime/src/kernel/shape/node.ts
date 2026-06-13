import type { ReactiveEdge } from "./edge";
import { isPayload } from "./node.dev";

export type ComputeFn<T> = (() => T) | null;

export class ReactiveNode<T = unknown> {
  state: number = 0;
  firstOut: ReactiveEdge | null = null;
  lastOut: ReactiveEdge | null = null;
  firstIn: ReactiveEdge | null = null;
  lastIn: ReactiveEdge | null = null;
  tailIn: ReactiveEdge | null = null;
  compute: ComputeFn<T> = null;
  payload: T;

  constructor(payload: T, compute: ComputeFn<T>, state: number) {
    if (__DEV__ && !isPayload(payload)) {
      throw new TypeError("ReactiveNode payload must be primitive, function, array, or plain object.");
    }

    this.state = state | 0;
    this.compute = compute;
    this.payload = payload;
  }
}

export default ReactiveNode;
