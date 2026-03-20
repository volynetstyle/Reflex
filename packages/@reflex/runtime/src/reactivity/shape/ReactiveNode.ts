import { Reactivable } from "./Reactivable";
import { ReactiveEdge } from "./ReactiveEdge";
import { ReactiveNodeKind } from "./ReactiveMeta";

type ComputeFn<T> = ((previous?: T) => T) | (() => T) | null;

class ReactiveNode<T = unknown> implements Reactivable {
  firstOut: ReactiveEdge | null;
  lastOut: ReactiveEdge | null;
  firstIn: ReactiveEdge | null;
  lastIn: ReactiveEdge | null;
  state: number;
  kind: ReactiveNodeKind;
  compute: ComputeFn<T>;
  payload: T;
  pendingPayload: T;
  depsTail: ReactiveEdge | null = null;

  constructor(
    payload: T | undefined,
    compute: ComputeFn<T>,
    state: number,
    kind: ReactiveNodeKind,
  ) {
    this.firstOut = null;
    this.lastOut = null;
    this.firstIn = null;
    this.lastIn = null;
    this.state = state;
    this.kind = kind;
    this.compute = compute;
    this.payload = payload as T;
    this.pendingPayload = payload as T;
  }
}

export type { Reactivable, ReactiveNode };
export default ReactiveNode;
