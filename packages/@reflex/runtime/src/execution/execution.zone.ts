import ReactiveNode, { ReactiveRoot } from "../reactivity/shape/ReactiveNode";

const causalZone = new ReactiveRoot();

export const isDirty = (localTime: number) => causalZone.t === localTime;

// @__INLINE__
export function stampSignal(node: ReactiveNode) {
  node.t = ++causalZone.t;
}
