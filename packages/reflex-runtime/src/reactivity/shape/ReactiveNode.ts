import type { ReactiveEdge } from "./ReactiveEdge";

export type Primitive =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined;

export type Payload<T> =
  T extends Primitive | Function
    ? T
    : T extends readonly (infer U)[]
      ? readonly Payload<U>[]
      : { readonly [K in keyof T]: Payload<T[K]> };

export type ComputeFn<T> = (() => T) | null;

export class ReactiveNode<T = unknown> {
  state: number = 0;

  firstOut: ReactiveEdge | null = null;
  lastOut: ReactiveEdge | null = null;

  firstIn: ReactiveEdge | null = null;
  lastIn: ReactiveEdge | null = null;

  /**
   * Operational cursor for dependency tracking.
   * Not a structural graph invariant.
   */
  lastInTail: ReactiveEdge | null = null;

  compute: ComputeFn<T> = null;
  payload: T;

  constructor(payload: T, compute: ComputeFn<T>, state: number) {
    this.payload = payload;
    this.compute = compute;
    this.state = state | 0;
  }
}

export default ReactiveNode;
