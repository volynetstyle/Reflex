import { addCleanup, dispose } from "./ownership.cleanup";
import { isShuttingDown } from "./ownership.meta";
import { OwnershipNode } from "./ownership.node";
import { prependChild } from "./ownership.tree";

export interface OwnerHookState {
  currentHookContext: unknown | null;
  componentHookDepth: number;
  warnedHooks: Set<string>;
}

export interface OwnerContext {
  currentOwner: OwnershipNode | null;
  hookState: OwnerHookState;
}

let activeOwnerContext: OwnerContext | null = null;

function createOwnerHookState(): OwnerHookState {
  return {
    currentHookContext: null,
    componentHookDepth: 0,
    warnedHooks: new Set<string>(),
  };
}

export function createOwnerContext(): OwnerContext {
  return Object.preventExtensions({
    currentOwner: null,
    hookState: createOwnerHookState(),
  });
}

export function createOwnershipNode(): OwnershipNode {
  return new OwnershipNode();
}

export function getOwner(owner: OwnerContext): OwnershipNode | null {
  return owner.currentOwner;
}

export function runWithOwner<T>(
  owner: OwnerContext,
  OwnershipNode: OwnershipNode | null,
  fn: () => T,
): T {
  const previousOwner = owner.currentOwner;
  const previousActiveOwnerContext = activeOwnerContext;
  owner.currentOwner = OwnershipNode;
  activeOwnerContext = owner;

  try {
    return fn();
  } finally {
    owner.currentOwner = previousOwner;
    activeOwnerContext = previousActiveOwnerContext;
  }
}

export function getActiveOwnerContext(): OwnerContext | null {
  return activeOwnerContext;
}

function attachOwnershipNode(
  parent: OwnershipNode | null,
  OwnershipNode: OwnershipNode,
): void {
  if (
    parent === null ||
    parent === OwnershipNode ||
    OwnershipNode.parent === parent ||
    isShuttingDown(parent) ||
    isShuttingDown(OwnershipNode)
  ) {
    return;
  }

  prependChild(parent, OwnershipNode);
}

export function runWithOwnershipNode<T>(
  owner: OwnerContext,
  OwnershipNode: OwnershipNode,
  fn: () => T,
): T {
  if (isShuttingDown(OwnershipNode)) {
    if (__DEV__) {
      throw new Error("runWithOwnershipNode on disposed OwnershipNode");
    }

    return undefined as T;
  }

  attachOwnershipNode(owner.currentOwner, OwnershipNode);

  return runWithOwner(owner, OwnershipNode, fn);
}

export function registerCleanup(owner: OwnerContext, fn: () => void): void {
  const OwnershipNode = owner.currentOwner;

  if (OwnershipNode !== null) {
    if (__DEV__ && isShuttingDown(OwnershipNode)) {
      throw new Error("register cleanup into disposed OwnershipNode");
    }

    addCleanup(OwnershipNode, fn);
  }
}

export function disposeOwnershipNode(OwnershipNode: OwnershipNode): void {
  dispose(OwnershipNode);
}

/** @deprecated Use `OwnershipNode` directly. */
export type Scope = OwnershipNode;

/** @deprecated Use `createOwnershipNode`. */
export const createScope = createOwnershipNode;

/** @deprecated Use `runWithOwnershipNode`. */
export const runWithScope = runWithOwnershipNode;

/** @deprecated Use `runWithOwnershipNode`. */
export const runInOwnershipScope = runWithOwnershipNode;

/** @deprecated Use `disposeOwnershipNode`. */
export const disposeScope = disposeOwnershipNode;
