import { Reactivable } from "./Reactivable";
import { ReactiveEdge } from "./ReactiveEdge";
import { ReactiveNodeKind } from "./ReactiveMeta";

type ComputeFn<T> = ((previous?: T) => T) | (() => T) | null;
const UNINITIALIZED = Symbol("UNINITIALIZED");

class ReactiveNode<T = unknown> implements Reactivable {
  state: number;
  kind: ReactiveNodeKind;
  compute: ComputeFn<T>;
  firstOut: ReactiveEdge | null;
  firstIn: ReactiveEdge | null;
  lastOut: ReactiveEdge | null;
  lastIn: ReactiveEdge | null;
  depsTail: ReactiveEdge | null;
  payload: T;
  pendingPayload: T;

  constructor(
    payload: T | undefined,
    compute: ComputeFn<T>,
    state: number,
    kind: ReactiveNodeKind,
  ) {
    this.state = state;
    this.kind = kind;
    this.compute = compute;
    this.firstOut = null;
    this.firstIn = null;
    this.lastOut = null;
    this.lastIn = null;
    this.depsTail = null;
    this.payload = payload as T;
    this.pendingPayload = payload as T;
  }
}

export { UNINITIALIZED };
export type { Reactivable, ReactiveNode, ComputeFn };
export default ReactiveNode;
