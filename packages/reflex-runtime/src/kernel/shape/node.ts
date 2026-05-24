import type { ReactiveEdge } from "./edge";
import type { NormalizedGraphReductionOptions } from "../reduction";

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
  tailIn: ReactiveEdge | null = null;

  /**
   * Current graph topology structural version.
   */
  s: number = 0;

  compute: ComputeFn<T> = null;
  graphReductionPolicy: NormalizedGraphReductionOptions | null = null;
  payload: T;

  constructor(payload: T, compute: ComputeFn<T>, state: number) {
    this.state = state | 0;
    this.compute = compute;
    this.payload = payload;
  }
}

// @__INLINE__
export function bumpNodes(node: ReactiveNode): void {
  const next = (node.s + 1) >>> 0;
  node.s = next === 0 ? 1 : next;
}

export default ReactiveNode;
