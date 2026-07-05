import type { Cleanup } from "../types/core";
import { isShuttingDown, markClosing, markDisposed } from "./ownership.meta";
import type { OwnershipNode } from "./ownership.node";
import { detach } from "./ownership.tree";

export function addCleanup(node: OwnershipNode, fn: Cleanup): void {
  if (isShuttingDown(node)) return;

  const cleanups = node.cleanups;

  if (cleanups === null) {
    node.cleanups = fn;
    return;
  }

  if (typeof cleanups === "function") {
    node.cleanups = [cleanups, fn];
    return;
  }

  cleanups[cleanups.length] = fn;
}

function reportCleanupError(error: unknown): void {
  console.error("Ownership cleanup error:", error);
}

function runCleanup(fn: Cleanup): void {
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
    runCleanup(cleanups);
    return;
  }

  for (let i = cleanups.length - 1; i >= 0; i--) {
    runCleanup(cleanups[i]!);
  }
}

export function disposeOwnershipNode(root: OwnershipNode): void {
  if (isShuttingDown(root)) return;

  markClosing(root);

  if (root.firstChild === null) {
    disposeClosedRootLeaf(root);
    return;
  }

  markDescendantsClosing(root);
  disposeClosedSubtree(root);
}

function disposeClosedRootLeaf(root: OwnershipNode): void {
  runCleanups(root);
  markDisposed(root);

  detach(root);

  root.context = null;
}

function disposeClosedSubtree(root: OwnershipNode): void {
  let node: OwnershipNode | null = root;

  while (node !== null) {
    const child: OwnershipNode | null = node.firstChild;

    if (child !== null) {
      node = child;
      continue;
    }

    const isRoot: boolean = node === root;
    const parent: OwnershipNode | null = node.parent;
    const nextSibling: OwnershipNode | null = node.nextSibling;

    const next: OwnershipNode | null = isRoot ? null : (nextSibling ?? parent);

    runCleanups(node);
    markDisposed(node);

    if (isRoot) {
      detach(node);
    } else {
      parent!.firstChild = nextSibling;

      if (nextSibling !== null) {
        nextSibling.prevSibling = null;
      }

      node.parent = null;
      node.prevSibling = null;
      node.nextSibling = null;
    }

    node.firstChild = null;
    node.context = null;

    node = next;
  }
}

function markDescendantsClosing(root: OwnershipNode): void {
  let node: OwnershipNode | null = root.firstChild;

  while (node !== null) {
    markClosing(node);

    const child = node.firstChild;

    if (child !== null) {
      node = child;
      continue;
    }

    while (node !== root && node.nextSibling === null) {
      node = node.parent!;
    }

    if (node === root) {
      return;
    }

    node = node.nextSibling;
  }
}
