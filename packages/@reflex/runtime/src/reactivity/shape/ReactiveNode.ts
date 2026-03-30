import type { Reactivable } from "./Reactivable";
import type { ReactiveEdge } from "./ReactiveEdge";

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

type ComputeFnAsync<T> = () => Promise<T> & Promise<T>;

export class ReactiveNodeAsync<T, E> implements ReactiveNode {
  phase: number;

  state: number;
  compute: ComputeFnAsync<T>;
  firstOut: ReactiveEdge | null;
  firstIn: ReactiveEdge | null;
  lastOut: ReactiveEdge | null;
  lastIn: ReactiveEdge | null;
  depsTail: ReactiveEdge | null;
  payload: T | E;
  pending: T | null;

  constructor(
    payload: T | undefined,
    compute: ComputeFnAsync<T>,
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
    this.pending = null;
  }
}

export { UNINITIALIZED };
export type { Reactivable, ReactiveNode, ComputeFn };
export default ReactiveNode;
