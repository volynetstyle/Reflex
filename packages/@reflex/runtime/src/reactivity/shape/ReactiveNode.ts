import type { Reactivable } from "./Reactivable";
import type { ReactiveEdge } from "./ReactiveEdge";

export type Primitive =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined;

export type Payload<T> = T extends Primitive | Function
  ? T
  : T extends Array<infer U>
    ? ReadonlyArray<Payload<U>>
    : { readonly [K in keyof T]: Payload<T[K]> };

type ComputeFn<T> = (() => T) | null;

class ReactiveNode<T = unknown> implements Reactivable {
  state: number;
  firstOut: ReactiveEdge | null;
  firstIn: ReactiveEdge | null;
  lastOut: ReactiveEdge | null;
  lastIn: ReactiveEdge | null;
  lastInTail: ReactiveEdge | null;
  outDegree: number;

  compute: ComputeFn<T>;
  payload: T;

  constructor(payload: T, compute: ComputeFn<T>, state: number) {
    this.state = state | 0;
    this.firstOut = null;
    this.firstIn = null;
    this.lastOut = null;
    this.lastIn = null;
    this.lastInTail = null;
    this.outDegree = 0;

    this.compute = compute;
    this.payload = payload as T;
  }
}

export type { Reactivable, ReactiveNode, ComputeFn };
export default ReactiveNode;
