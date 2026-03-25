import { Reactivable } from "./Reactivable";
import type { ReactiveEdge } from "./ReactiveEdge";
import { ReactiveNodeState } from "./ReactiveMeta";

type ComputeFn<T> = (() => T) | null;
const UNINITIALIZED: unique symbol = Symbol.for("UNINITIALIZED");

class ReactiveNode<T = unknown> implements Reactivable {
  state: number;
  compute: ComputeFn<T>;
  firstOut: ReactiveEdge | null;
  firstIn: ReactiveEdge | null;
  lastOut: ReactiveEdge | null;
  lastIn: ReactiveEdge | null;
  depsTail: ReactiveEdge | null;
  payload: T;

  constructor(payload: T | undefined, compute: ComputeFn<T>, state: number) {
    this.state = state;
    this.compute = compute;
    this.firstOut = null;
    this.firstIn = null;
    this.lastOut = null;
    this.lastIn = null;
    this.depsTail = null;
    this.payload = payload as T;
  }
}

class ReactiveNodeAsync<T, E> implements ReactiveNode {
  phase: number;

  state: number;
  compute: ComputeFn<T>;
  firstOut: ReactiveEdge | null;
  firstIn: ReactiveEdge | null;
  lastOut: ReactiveEdge | null;
  lastIn: ReactiveEdge | null;
  depsTail: ReactiveEdge | null;
  payload: T | E;

  constructor(
    payload: T | undefined,
    compute: ComputeFn<T>,
    state: number,
  ) {
    this.phase = 0;
    this.state = state;
    this.compute = compute;
    this.firstOut = null;
    this.firstIn = null;
    this.lastOut = null;
    this.lastIn = null;
    this.depsTail = null;
    this.payload = payload as T;
  }
}

export { UNINITIALIZED };
export type { Reactivable, ReactiveNode, ComputeFn };
export default ReactiveNode;
