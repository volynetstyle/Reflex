import { withEffectCleanupRegistrar } from "@volynetstyle/reflex";
import { addCleanup, dispose } from "./ownership.cleanup";
import { isShuttingDown } from "./ownership.meta";
import { OwnershipNode } from "./ownership.node";
import { appendChild } from "./ownership.tree";

export type Scope = OwnershipNode;

export interface OwnerContext {
  currentOwner: Scope | null;
}

export function createOwnerContext(): OwnerContext {
  return Object.preventExtensions({
    currentOwner: null,
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
  owner.currentOwner = scope;

  try {
    return fn();
  } finally {
    owner.currentOwner = previousOwner;
  }
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

  appendChild(parent, scope);
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

  return runWithOwner(owner, scope, () =>
    withEffectCleanupRegistrar((cleanup) => addCleanup(scope, cleanup), fn),
  );
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
