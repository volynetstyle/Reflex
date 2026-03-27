import { effect, withEffectCleanupRegistrar } from "@volynetstyle/reflex";
import type { Cleanup } from "./types";

type OwnedEffectFn = () => void | (() => void);
interface OwnedEffectState {
  skipStartCallbacks: boolean;
}

let currentOwnedEffectState: OwnedEffectState | null = null;

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
    return withEffectCleanupRegistrar((cleanup) => {
      owner.currentScope?.cleanups.push(cleanup as Cleanup);
    }, fn);
  } finally {
    owner.currentScope = previousScope;
  }
}

export function registerCleanup(owner: OwnerContext, fn: Cleanup) {
  owner.currentScope?.cleanups.push(fn);
}

export function onEffectStart(fn: () => void) {
  if (currentOwnedEffectState === null) {
    fn();
    return;
  }

  if (!currentOwnedEffectState.skipStartCallbacks) {
    fn();
  }
}

export function ownedEffect(
  owner: OwnerContext,
  fn: OwnedEffectFn,
): () => void {
  return withEffectCleanupRegistrar(null, () => {
    const state: OwnedEffectState = {
      skipStartCallbacks: true,
    };

    const dispose = effect(() => {
      const previousState = currentOwnedEffectState;
      currentOwnedEffectState = state;

      try {
        return fn();
      } finally {
        currentOwnedEffectState = previousState;
        state.skipStartCallbacks = false;
      }
    });

    registerCleanup(owner, dispose as Cleanup);
    return dispose;
  });
}

export function disposeScope(scope: Scope) {
  for (let index = scope.cleanups.length - 1; index >= 0; index--) {
    scope.cleanups[index]?.();
  }

  scope.cleanups.length = 0;
}
