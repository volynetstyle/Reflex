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

export interface OwnershipReactiveAdapter {
  effect(fn: UseEffectFn): Cleanup;
}

export interface OwnershipReactiveBridge {
  readonly onEffectStart: (fn: () => void) => void;
  readonly useEffect: (options: OwnedEffectOptions, fn: UseEffectFn) => Cleanup;
  readonly runInOwnershipScope: <T>(
    owner: OwnerContext,
    scope: Scope,
    fn: () => T,
  ) => T;
}

interface EffectStartGate {
  skip: boolean;
}

const EFFECT_CLEANUP_HOOK = Symbol.for("reflex.effectCleanupHook");
const noopCleanup: Cleanup = () => {};
let suppressEffectCleanupHook = false;

type EffectCleanupHook = (dispose: Cleanup) => void;
type EffectCleanupGlobal = typeof globalThis & {
  [EFFECT_CLEANUP_HOOK]?: EffectCleanupHook;
};

function installEffectCleanupHook(): void {
  (globalThis as EffectCleanupGlobal)[EFFECT_CLEANUP_HOOK] = (dispose) => {
    if (suppressEffectCleanupHook) return;

    const owner = getActiveOwnerContext();
    const scope = owner?.currentOwner ?? null;
    if (scope !== null) addCleanup(scope, dispose);
  };
}

installEffectCleanupHook();

export function createOwnershipReactiveBridge(
  adapter: OwnershipReactiveAdapter,
): OwnershipReactiveBridge {
  let currentStartGate: EffectStartGate | null = null;

  const onEffectStart = (fn: () => void): void => {
    if (currentStartGate?.skip !== true) fn();
  };

  const runInOwnershipScope = <T>(
    owner: OwnerContext,
    scope: Scope,
    fn: () => T,
  ): T => runWithScope(owner, scope, fn);

  const useEffect = (options: OwnedEffectOptions, fn: UseEffectFn): Cleanup => {
    const { owner } = options;
    const scope = owner.currentOwner;

    if (scope !== null && isShuttingDown(scope)) {
      if (__DEV__) throw new Error("useEffect in disposed scope");
      return noopCleanup;
    }

    const gate: EffectStartGate = { skip: true };

    suppressEffectCleanupHook = true;
    let dispose: Cleanup;

    try {
      dispose = adapter.effect(() => {
        const prevGate = currentStartGate;
        currentStartGate = gate;

        try {
          return runWithOwner(owner, scope, fn);
        } finally {
          currentStartGate = prevGate;
          gate.skip = false;
        }
      });
    } finally {
      suppressEffectCleanupHook = false;
    }

    if (scope !== null) addCleanup(scope, dispose);

    return dispose;
  };

  return Object.freeze({
    onEffectStart,
    useEffect,
    runInOwnershipScope,
  });
}

export const reflexOwnershipBridge: OwnershipReactiveBridge =
  createOwnershipReactiveBridge({
    effect(fn) {
      return effect(fn);
    },
  });

export const {
  onEffectStart,
  runInOwnershipScope,
  useEffect: useOwnedEffect,
} = reflexOwnershipBridge;
