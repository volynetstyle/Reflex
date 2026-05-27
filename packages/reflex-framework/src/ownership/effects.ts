import { effect } from "@volynets/reflex";

import type { Cleanup } from "../types/core";
import { addCleanup } from "./ownership.cleanup";
import { isShuttingDown } from "./ownership.meta";
import type { OwnerContext, Scope } from "./ownership.scope";
import {
  getActiveOwnerContext,
  runWithOwner,
  runWithScope,
} from "./ownership.scope";

export type UseEffectFn = () => void | Cleanup;

export interface OwnedEffectOptions {
  owner: OwnerContext;
}

const noopCleanup: Cleanup = () => {};

let skipEffectStart = false;

export function registerActiveOwnerCleanup(dispose: Cleanup): void {
  const owner = getActiveOwnerContext();
  if (owner?.effectCleanupSuppressionDepth) return;

  const scope = owner?.currentOwner ?? null;
  if (scope !== null) addCleanup(scope, dispose);
}

export function onEffectStart(fn: () => void): void {
  if (!skipEffectStart) fn();
}

export function runInOwnershipScope<T>(
  owner: OwnerContext,
  scope: Scope,
  fn: () => T,
): T {
  return runWithScope(owner, scope, fn);
}

export function useOwnedEffect(
  options: OwnedEffectOptions,
  fn: UseEffectFn,
): Cleanup {
  const { owner } = options;
  const scope = owner.currentOwner;

  if (scope !== null && isShuttingDown(scope)) {
    if (__DEV__) throw new Error("useEffect in disposed scope");
    return noopCleanup;
  }

  let skipInitialStart = true;
  let dispose: Cleanup;
  owner.effectCleanupSuppressionDepth++;

  const effectCallable = () => {
    const previousSkipEffectStart = skipEffectStart;
    skipEffectStart = skipInitialStart;

    try {
      return runWithOwner(owner, scope, fn);
    } finally {
      skipEffectStart = previousSkipEffectStart;
      skipInitialStart = false;
    }
  };

  try {
    dispose = effect(effectCallable);
  } finally {
    owner.effectCleanupSuppressionDepth--;
  }

  if (scope !== null) addCleanup(scope, dispose);

  return dispose;
}
