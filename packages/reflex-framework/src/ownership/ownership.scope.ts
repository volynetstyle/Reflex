import { addCleanup, dispose } from "./ownership.cleanup";
import { isShuttingDown } from "./ownership.meta";
import { OwnershipNode } from "./ownership.node";
import { prependChild } from "./ownership.tree";

export type Scope = OwnershipNode;

export interface OwnerHookState {
  currentHookContext: unknown | null;
  componentHookDepth: number;
  warnedHooks: Set<string>;
}

export interface OwnerContext {
  currentOwner: Scope | null;
  hookState: OwnerHookState;
  effectCleanupSuppressionDepth: number;
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
    effectCleanupSuppressionDepth: 0,
  });
}

export function createScope(): Scope {
  return new OwnershipNode();
}

export function getOwner(owner: OwnerContext): Scope | null {
  return owner.currentOwner;
}

export function runWithOwner<T>(
  owner: OwnerContext,
  scope: Scope | null,
  fn: () => T,
): T {
  const previousOwner = owner.currentOwner;
  const previousActiveOwnerContext = activeOwnerContext;
  owner.currentOwner = scope;
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

function attachScope(parent: Scope | null, scope: Scope): void {
  if (
    parent === null ||
    parent === scope ||
    scope.parent === parent ||
    isShuttingDown(parent) ||
    isShuttingDown(scope)
  ) {
    return;
  }

  prependChild(parent, scope);
}

export function runWithScope<T>(
  owner: OwnerContext,
  scope: Scope,
  fn: () => T,
): T {
  if (isShuttingDown(scope)) {
    if (__DEV__) {
      throw new Error("runWithScope on disposed scope");
    }

    return undefined as T;
  }

  attachScope(owner.currentOwner, scope);

  return runWithOwner(owner, scope, fn);
}

export function registerCleanup(owner: OwnerContext, fn: () => void): void {
  const scope = owner.currentOwner;

  if (scope !== null) {
    if (__DEV__ && isShuttingDown(scope)) {
      throw new Error("register cleanup into disposed scope");
    }

    addCleanup(scope, fn);
  }
}

export function disposeScope(scope: Scope): void {
  dispose(scope);
}
