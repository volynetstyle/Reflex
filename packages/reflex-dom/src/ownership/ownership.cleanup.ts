import type { Cleanup } from "src/types";
import { isDisposed, markDisposed } from "./ownership.meta";
import type { OwnershipNode } from "./ownership.node";
import { detach } from "./ownership.tree";

export function addCleanup(node: OwnershipNode, fn: Cleanup): void {
  if (isDisposed(node)) return;

  const cleanups = node.cleanups;

  if (cleanups === null) {
    node.cleanups = fn;
  } else if (typeof cleanups === "function") {
    node.cleanups = [cleanups, fn];
  } else {
    cleanups.push(fn);
  }
}

function reportCleanupError(error: unknown): void {
  console.error("Ownership cleanup error:", error);
}

function invokeCleanup(fn: Cleanup): void {
  try {
    fn();
  } catch (error) {
    reportCleanupError(error);
  }
}

function runCleanups(node: OwnershipNode): void {
  const cleanups = node.cleanups;
  if (cleanups === null) return;

  node.cleanups = null;

  if (typeof cleanups === "function") {
    invokeCleanup(cleanups);
    return;
  }

  for (let i = cleanups.length - 1; i >= 0; i--) {
    invokeCleanup(cleanups[i]!);
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

    const next: OwnershipNode | null =
      node === root ? null : (node.nextSibling ?? node.parent);

    runCleanups(node);
    markDisposed(node);
    detach(node);

    node.firstChild = null;
    node.lastChild = null;
    node.context = null;

    node = next;
  }
}
