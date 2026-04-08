import { decChildCount, incChildCount, isShuttingDown } from "./ownership.meta";
import type { OwnershipNode } from "./ownership.node";

export function appendChild(parent: OwnershipNode, child: OwnershipNode): void {
  if (isShuttingDown(parent) || isShuttingDown(child)) return;
  if (child === parent) {
    throw new Error("Cannot append node to itself");
  }

  detach(child);

  child.parent = parent;
  child.nextSibling = null;

  const last = parent.lastChild;
  child.prevSibling = last;

  if (last !== null) {
    last.nextSibling = child;
  } else {
    parent.firstChild = child;
  }

  parent.lastChild = child;
  incChildCount(parent);
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
  } else {
    parent.lastChild = prev;
  }

  node.parent = node.prevSibling = node.nextSibling = null;

  decChildCount(parent);
}
