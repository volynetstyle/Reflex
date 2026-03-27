import { isDisposed, markDisposed } from "./ownership.meta";
import { OwnershipNode } from "./ownership.node";
import { detach } from "./ownership.tree";

export function addCleanup(node: OwnershipNode, fn: () => void): void {
  if (isDisposed(node)) return;

  const cleanups = node.cleanups;

  if (cleanups === null) {
    node.cleanups = fn;
    return;
  }

  if (typeof cleanups === "function") {
    node.cleanups = [cleanups, fn];
    return;
  }

  cleanups.push(fn);
}

function reportCleanupError(error: unknown): void {
  console.error("Ownership cleanup error:", error);
}

function runCleanups(node: OwnershipNode): void {
  const cleanups = node.cleanups;
  node.cleanups = null;

  if (cleanups === null) {
    return;
  }

  if (typeof cleanups === "function") {
    try {
      cleanups();
    } catch (error) {
      reportCleanupError(error);
    }

    return;
  }

  for (let index = cleanups.length - 1; index >= 0; index--) {
    try {
      cleanups[index]?.();
    } catch (error) {
      reportCleanupError(error);
    }
  }
}

export function dispose(root: OwnershipNode): void {
  if (isDisposed(root)) return;

  let node: OwnershipNode | null = root;

  while (node !== null) {
    const child: OwnershipNode | null = node.firstChild;

    if (child !== null) {
      node = child;
      continue;
    }

    const nextSibling: OwnershipNode | null = node.nextSibling;
    const parent: OwnershipNode | null = node.parent;

    runCleanups(node);
    markDisposed(node);
    detach(node);

    node.firstChild = null;
    node.lastChild = null;
    node.context = null;

    node = node === root ? null : (nextSibling ?? parent);
  }
}
