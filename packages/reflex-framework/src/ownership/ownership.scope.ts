import { addCleanup, disposeOwnershipNode } from "./ownership.cleanup";
import { isShuttingDown } from "./ownership.meta";
import { OwnershipNode } from "./ownership.node";
import { prependChild } from "./ownership.tree";

export interface OwnerHookState {
  currentComponentContext: unknown | null;
  componentExecutionDepth: number;
  warnedHooks: Set<string>;
}

export interface OwnerContext {
  currentNode: OwnershipNode | null;
  hookState: OwnerHookState;
}

let activeOwnerContext: OwnerContext | null = null;

function createOwnerHookState(): OwnerHookState {
  return {
    currentComponentContext: null,
    componentExecutionDepth: 0,
    warnedHooks: new Set<string>(),
  };
}

export function createOwnerContext(): OwnerContext {
  return Object.preventExtensions({
    currentNode: null,
    hookState: createOwnerHookState(),
  });
}

export function createOwnershipNode(): OwnershipNode {
  return new OwnershipNode();
}

export function getActiveOwnerContext(): OwnerContext | null {
  return activeOwnerContext;
}

export function runWithOwner<T>(
  owner: OwnerContext,
  node: OwnershipNode | null,
  fn: () => T,
): T {
  const previousNode = owner.currentNode;
  const previousActiveOwnerContext = activeOwnerContext;

  owner.currentNode = node;
  activeOwnerContext = owner;

  try {
    return fn();
  } finally {
    owner.currentNode = previousNode;
    activeOwnerContext = previousActiveOwnerContext;
  }
}

function attachOwnershipNode(
  parent: OwnershipNode | null,
  child: OwnershipNode,
): void {
  if (
    parent === null ||
    parent === child ||
    child.parent === parent ||
    isShuttingDown(parent) ||
    isShuttingDown(child)
  ) {
    return;
  }

  prependChild(parent, child);
}

export function runWithOwnershipNode<T>(
  owner: OwnerContext,
  node: OwnershipNode,
  fn: () => T,
): T {
  if (isShuttingDown(node)) {
    if (__DEV__) {
      throw new Error("runWithOwnershipNode on disposed OwnershipNode");
    }

    return undefined as T;
  }

  attachOwnershipNode(owner.currentNode, node);

  return runWithOwner(owner, node, fn);
}

export function usingOwnershipNode<Result>(
  owner: OwnerContext,
  callback: (node: OwnershipNode) => Result,
): Result {
  const node = createOwnershipNode();

  try {
    return runWithOwnershipNode(owner, node, () => callback(node));
  } catch (error) {
    disposeOwnershipNode(node);
    throw error;
  }
}

export function registerCleanup(owner: OwnerContext, fn: () => void): void {
  const node = owner.currentNode;

  if (node === null) return;

  if (__DEV__ && isShuttingDown(node)) {
    throw new Error("register cleanup into disposed OwnershipNode");
  }

  addCleanup(node, fn);
}
