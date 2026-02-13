import ReactiveNode from "../reactivity/shape/ReactiveNode";

// Pre-allocated typed buffer for better cache locality and GC pressure
// Max nesting depth of 256 computations (typical stack depth is < 10)
const buf = new Array<ReactiveNode | null>(256);
let i = 0;

// @__INLINE__
export const currentComputation = (): ReactiveNode | null => {
  const idx = i - 1;
  return idx >= 0 ? buf[idx] : null;
};

// @__INLINE__
export const beginComputation = (n: ReactiveNode): void => {
  if (i >= buf.length) {
    throw new Error(`Computation stack overflow: max depth ${buf.length}`);
  }
  buf[i++] = n;
};

// @__INLINE__
export const endComputation = (): void => {
  buf[--i] = null;
};
