import { Reactivable } from "./Reactivable";
import { ReactiveEdge } from "./ReactiveEdge";
import { ReactiveNodeKind, ReactiveNodeState } from "./ReactiveMeta";

type ComputeFn<T> = ((previous?: T) => T) | (() => T) | null;

class ReactiveNode<T = unknown> implements Reactivable {
  kind: ReactiveNodeKind;
  t: number;
  v: number;
  state: number;
  compute: ComputeFn<T>;
  payload: T;
  s: number;
  firstOut: ReactiveEdge | null;
  lastOut: ReactiveEdge | null;
  firstIn: ReactiveEdge | null;
  lastIn: ReactiveEdge | null;
  depsTail: ReactiveEdge | null = null;

  constructor(
    payload: T | undefined,
    compute: ComputeFn<T>,
    state: number,
    kind: ReactiveNodeKind,
  ) {
    this.kind = kind;
    this.t = 0;
    this.v = 0;
    this.state = state;
    this.compute = compute;
    this.payload = payload as T;
    this.s = 0;
    this.firstOut = null;
    this.lastOut = null;
    this.firstIn = null;
    this.lastIn = null;
  }
}

export type { Reactivable, ReactiveNode };
export default ReactiveNode;
