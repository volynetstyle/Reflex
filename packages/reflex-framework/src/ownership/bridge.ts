import type { Cleanup } from "../types/core";
import { addCleanup } from "./ownership.cleanup";
import { isShuttingDown } from "./ownership.meta";
import type { OwnerContext, Scope } from "./ownership.scope";
import { runWithOwner, runWithScope } from "./ownership.scope";

export type useEffectFn = () => void | Cleanup;
export type OwnershipCleanupRegistrar = (cleanup: Cleanup) => void;

export interface OwnershipReactiveAdapter {
  effect(fn: useEffectFn): Cleanup;
  withCleanupRegistrar<T>(
    registrar: OwnershipCleanupRegistrar | null,
    fn: () => T,
  ): T;
}

export interface OwnershipReactiveBridge {
  readonly onEffectStart: (fn: () => void) => void;
  readonly useEffect: (owner: OwnerContext, fn: useEffectFn) => Cleanup;
  readonly runInOwnershipScope: <T>(
    owner: OwnerContext,
    scope: Scope,
    fn: () => T,
  ) => T;
}

interface useEffectState {
  skipStartCallbacks: boolean;
}

export function createOwnershipReactiveBridge(
  adapter: OwnershipReactiveAdapter,
): OwnershipReactiveBridge {
  let currentuseEffectState: useEffectState | null = null;

  function onEffectStart(fn: () => void): void {
    if (currentuseEffectState === null) {
      fn();
      return;
    }

    if (!currentuseEffectState.skipStartCallbacks) {
      fn();
    }
  }

  function runInOwnershipScope<T>(
    owner: OwnerContext,
    scope: Scope,
    fn: () => T,
  ): T {
    return runWithScope(owner, scope, () =>
      adapter.withCleanupRegistrar((cleanup) => addCleanup(scope, cleanup), fn),
    );
  }

  function useEffect(owner: OwnerContext, fn: useEffectFn): Cleanup {
    const scope = owner.currentOwner;

    if (scope !== null && isShuttingDown(scope)) {
      if (__DEV__) {
        throw new Error("useEffect in disposed scope");
      }

      return (() => {}) as Cleanup;
    }

    return adapter.withCleanupRegistrar(null, () => {
      const state: useEffectState = {
        skipStartCallbacks: true,
      };

      const dispose = adapter.effect(() =>
        runWithOwner(owner, scope, () => {
          const previousState = currentuseEffectState;
          currentuseEffectState = state;

          try {
            return fn();
          } finally {
            currentuseEffectState = previousState;
            state.skipStartCallbacks = false;
          }
        }),
      );

      if (scope !== null) {
        addCleanup(scope, dispose);
      }

      return dispose;
    });
  }

  return Object.freeze({
    onEffectStart,
    useEffect,
    runInOwnershipScope,
  });
}
