import { effect, withEffectCleanupRegistrar } from "@volynetstyle/reflex";
import { addCleanup } from "./ownership.cleanup";
import { isShuttingDown } from "./ownership.meta";
import type { OwnerContext } from "./ownership.scope";
import { runWithOwner } from "./ownership.scope";

type OwnedEffectFn = () => void | (() => void);

interface OwnedEffectState {
  skipStartCallbacks: boolean;
}

let currentOwnedEffectState: OwnedEffectState | null = null;

export function onEffectStart(fn: () => void): void {
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
  const scope = owner.currentOwner;

  if (scope !== null && isShuttingDown(scope)) {
    if (__DEV__) {
      throw new Error("ownedEffect in disposed scope");
    }

    return () => {};
  }

  return withEffectCleanupRegistrar(null, () => {
    const state: OwnedEffectState = {
      skipStartCallbacks: true,
    };

    const dispose = effect(() =>
      runWithOwner(owner, scope, () => {
        const previousState = currentOwnedEffectState;
        currentOwnedEffectState = state;

        try {
          return fn();
        } finally {
          currentOwnedEffectState = previousState;
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
