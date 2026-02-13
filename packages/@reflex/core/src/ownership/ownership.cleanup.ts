import { isDisposed, markDisposed } from "./ownership.meta";
import { OwnershipNode } from "./ownership.node";
import { detach } from "./ownership.tree";

export function addCleanup(node: OwnershipNode, fn: NoneToVoidFn) {
  if (isDisposed(node)) return;

  const c = node.cleanups;

  if (!c) {
    node.cleanups = fn;
  } else if (typeof c === "function") {
    node.cleanups = [c, fn];
  } else {
    c.push(fn);
  }
}

function runCleanups(node: OwnershipNode) {
  const c = node.cleanups;
  node.cleanups = null;

  if (!c) return;

  try {
    if (typeof c === "function") {
      c();
    } else {
      for (let i = c.length - 1; i >= 0; i--) {
        c[i]!();
      }
    }
  } catch (err) {
    console.error("Ownership cleanup error:", err);
  }
}

export function dispose(root: OwnershipNode): void {
  if (isDisposed(root)) return;

  let node: OwnershipNode | null = root;

  while (node) {
    const child: OwnershipNode | null = node.firstChild;

    if (child) {
      detach(child);
      node = child;
      continue;
    }

    const parent: OwnershipNode | null = node.parent;

    runCleanups(node);
    markDisposed(node);

    detach(node);

    node.firstChild = null;
    node.lastChild = null;
    node.context = null;

    node = parent;
  }
}
