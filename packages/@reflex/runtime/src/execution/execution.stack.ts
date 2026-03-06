import ReactiveNode from "../reactivity/shape/ReactiveNode";

let computation: ReactiveNode | null = null;

// @__INLINE__
export const currentComputation = (): ReactiveNode | null => computation;
// @__INLINE__
export const beginComputation = (n: ReactiveNode) => void (computation = n);
// @__INLINE__
export const endComputation = () => void (computation = null);
