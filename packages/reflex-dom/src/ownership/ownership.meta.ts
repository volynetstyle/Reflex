import type { OwnershipNode } from "./ownership.node";

const CHILD_MASK = 0x00ffffff;
const FLAG_SHIFT = 24;

export const enum OwnershipFlags {
  DISPOSED = 1,
}

export function getChildCount(node: OwnershipNode): number {
  return node.meta & CHILD_MASK;
}

export function setChildCount(node: OwnershipNode, value: number): void {
  node.meta = (node.meta & ~CHILD_MASK) | (value & CHILD_MASK);
}

export function incChildCount(node: OwnershipNode): void {
  ++node.meta;
}

export function decChildCount(node: OwnershipNode): void {
  --node.meta;
}

export function isDisposed(node: OwnershipNode): boolean {
  return !!(((node.meta >>> FLAG_SHIFT) & OwnershipFlags.DISPOSED) !== 0);
}

export function markDisposed(node: OwnershipNode): void {
  node.meta |= OwnershipFlags.DISPOSED << FLAG_SHIFT;
}
