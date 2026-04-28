import type { OwnershipNode } from "./ownership.node";

export const enum OwnershipFlags {
  CLOSING = 1 << 0,
  DISPOSED = 1 << 1,
}

export function isDisposed(node: OwnershipNode): boolean {
  return (node.meta & OwnershipFlags.DISPOSED) !== 0;
}

export function isClosing(node: OwnershipNode): boolean {
  return (node.meta & OwnershipFlags.CLOSING) !== 0;
}

export function isShuttingDown(node: OwnershipNode): boolean {
  return isClosing(node) || isDisposed(node);
}

export function markClosing(node: OwnershipNode): void {
  node.meta |= OwnershipFlags.CLOSING;
}

export function markDisposed(node: OwnershipNode): void {
  node.meta |= OwnershipFlags.DISPOSED;
}
