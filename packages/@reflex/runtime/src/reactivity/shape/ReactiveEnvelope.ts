import { NodeKind } from "./ReactiveMeta";
import { Reactivable } from "./ReactiveNode";

interface ReactiveEnvelopeEvent<T extends Reactivable, V> {}

class ReactiveEnvelopeEvent<T, V> implements ReactiveEnvelopeEvent<T, V> {
  t: number;
  v: number;
  p: number;
  s: number;
  order: number;

  target: T;
  payload: V;

  kind: number;

  constructor(
    t: number,
    v: number,
    p: number,
    s: number,
    order: number,
    target: T,
    payload: V,
  ) {
    this.t = t;
    this.v = v;
    this.p = p;
    this.s = s;
    this.order = order;
    this.target = target;
    this.payload = payload;
    this.kind = NodeKind.Envelope;
  }
}

export type { ReactiveEnvelopeEvent };
export default ReactiveEnvelopeEvent;
