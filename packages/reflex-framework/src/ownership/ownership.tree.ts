import { isShuttingDown } from "./ownership.meta";
import type { OwnershipNode } from "./ownership.node";

export function prependChild(parent: OwnershipNode, child: OwnershipNode): void {
  if (isShuttingDown(parent) || isShuttingDown(child)) return;
  if (child === parent) {
    throw new Error("Cannot prepend node to itself");
  }

  detach(child);

  child.parent = parent;
  child.prevSibling = null;
  child.nextSibling = parent.firstChild;

  if (child.nextSibling !== null) {
    child.nextSibling.prevSibling = child;
  }

  parent.firstChild = child;
}

export function detach(node: OwnershipNode): void {
  const parent = node.parent;
  if (parent === null) return;

  const prev = node.prevSibling;
  const next = node.nextSibling;

  if (prev !== null) {
    prev.nextSibling = next;
  } else {
    parent.firstChild = next;
  }

  if (next !== null) {
    next.prevSibling = prev;
  }

  node.parent = node.prevSibling = node.nextSibling = null;
}
