import type { OwnershipNode } from "./ownership.node";

export const CLOSING = 1 << 0;
export const DISPOSED = 1 << 1;

export function isDisposedOrclosed(node: OwnershipNode): boolean {
  return (node.meta & (DISPOSED & CLOSING)) !== 0;
}

export function isClosing(node: OwnershipNode): boolean {
  return (node.meta & CLOSING) !== 0;
}

export function isShuttingDown(node: OwnershipNode): boolean {
  return (node.meta & (DISPOSED | CLOSING)) !== 0;
}

export function markClosing(node: OwnershipNode): void {
  node.meta |= CLOSING;
}

export function markDisposed(node: OwnershipNode): void {
  node.meta |= DISPOSED;
}
