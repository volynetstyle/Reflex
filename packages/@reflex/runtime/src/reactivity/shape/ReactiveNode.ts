import type { Reactivable } from "./Reactivable";
import type { ReactiveEdge } from "./ReactiveEdge";

type ComputeFn<T> = (() => T) | null;

const UNINITIALIZED: unique symbol = Symbol.for("UNINITIALIZED");

class ReactiveNode<T = unknown> implements Reactivable {
  state: number;
  firstOut: ReactiveEdge | null;
  firstIn: ReactiveEdge | null;
  lastOut: ReactiveEdge | null;
  lastIn: ReactiveEdge | null;
  compute: ComputeFn<T>;
  depsTail: ReactiveEdge | null;
  payload: T;

  constructor(payload: T | undefined, compute: ComputeFn<T>, state: number) {
    this.state = state;
    this.firstOut = null;
    this.firstIn = null;
    this.lastOut = null;
    this.lastIn = null;
    this.compute = compute;
    this.depsTail = null;
    this.payload = payload as T;
  }
}

export { UNINITIALIZED };
export type { Reactivable, ReactiveNode, ComputeFn };
export default ReactiveNode;
