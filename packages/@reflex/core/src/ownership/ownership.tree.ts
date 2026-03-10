import { isDisposed, incChildCount, decChildCount } from "./ownership.meta";
import { OwnershipNode } from "./ownership.node";

// @__INLINE__
export function appendChild(parent: OwnershipNode, child: OwnershipNode): void {
  if (isDisposed(parent)) return;
  if (child === parent) throw new Error("Cannot append node to itself");

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

// @__INLINE__
export function detach(node: OwnershipNode): void {
  const parent = node.parent;
  if (!parent) return;

  const prev = node.prevSibling;
  const next = node.nextSibling;

  if (prev) prev.nextSibling = next;
  else parent.firstChild = next;

  if (next) next.prevSibling = prev;
  else parent.lastChild = prev;

  node.parent = null;
  node.prevSibling = null;
  node.nextSibling = null;

  decChildCount(parent);
}

