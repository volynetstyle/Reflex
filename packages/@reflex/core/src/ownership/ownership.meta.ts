import { OwnershipNode } from "./ownership.node";

const CHILD_MASK = 0x00ffffff;
const FLAG_SHIFT = 24;

export const enum OwnershipFlags {
  DISPOSED = 1,
}

// @__INLINE__
export function getChildCount(n: OwnershipNode) {
  return n.meta & CHILD_MASK;
}

// @__INLINE__
export function setChildCount(n: OwnershipNode, v: number) {
  n.meta = (n.meta & ~CHILD_MASK) | (v & CHILD_MASK);
}

// @__INLINE__
export function incChildCount(n: OwnershipNode) {
  ++n.meta;
}

// @__INLINE__
export function decChildCount(n: OwnershipNode) {
  --n.meta;
}

// @__INLINE__
export function isDisposed(n: OwnershipNode) {
  return (n.meta >>> FLAG_SHIFT) & OwnershipFlags.DISPOSED;
}

// @__INLINE__
export function markDisposed(n: OwnershipNode) {
  n.meta |= OwnershipFlags.DISPOSED << FLAG_SHIFT;
}
