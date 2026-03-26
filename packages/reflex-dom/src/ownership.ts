import type { Cleanup } from "./types";

const EFFECT_CLEANUP_REGISTRAR = Symbol.for("reflex.effect.cleanup.register");

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
  const host = globalThis as typeof globalThis & {
    [EFFECT_CLEANUP_REGISTRAR]?: (cleanup: Cleanup) => void;
  };
  const previousRegistrar = host[EFFECT_CLEANUP_REGISTRAR];
  owner.currentScope = scope;
  host[EFFECT_CLEANUP_REGISTRAR] = (cleanup) => {
    owner.currentScope?.cleanups.push(cleanup);
  };

  try {
    return fn();
  } finally {
    owner.currentScope = previousScope;
    host[EFFECT_CLEANUP_REGISTRAR] = previousRegistrar;
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
