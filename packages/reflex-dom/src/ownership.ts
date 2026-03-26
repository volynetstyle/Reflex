import type { Cleanup } from "./types";

export interface Scope {
  cleanups: Cleanup[];
}

export interface OwnerContext {
  currentScope: Scope | null;
}

export function createOwnerContext(): OwnerContext {
  return { currentScope: null };
}

export function createScope(): Scope {
  return { cleanups: [] };
}

export function runWithScope<T>(
  owner: OwnerContext,
  scope: Scope,
  fn: () => T,
): T {
  const previousScope = owner.currentScope;
  owner.currentScope = scope;

  try {
    return fn();
  } finally {
    owner.currentScope = previousScope;
  }
}

export function registerCleanup(owner: OwnerContext, fn: Cleanup) {
  owner.currentScope?.cleanups.push(fn);
}

export function disposeScope(scope: Scope) {
  for (let index = scope.cleanups.length - 1; index >= 0; index--) {
    scope.cleanups[index]?.();
  }

  scope.cleanups.length = 0;
}
