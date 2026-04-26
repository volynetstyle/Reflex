import {
  effect,
  effectRanked,
  withEffectCleanupRegistrar as withEffectCleanupScope,
} from "@volynets/reflex";

import type { Cleanup } from "../types/core";
import { addCleanup } from "./ownership.cleanup";
import { isShuttingDown } from "./ownership.meta";
import type { OwnerContext, Scope } from "./ownership.scope";
import { runWithOwner, runWithScope } from "./ownership.scope";

export type UseEffectFn = () => void | Cleanup;
export type OwnershipCleanupRegistrar = (cleanup: Cleanup) => void;

export interface OwnedEffectOptions {
  owner: OwnerContext;
  priority?: number;
  phase?: "user" | "render";
}

export interface OwnershipReactiveEffectOptions {
  priority?: number;
  phase?: "user" | "render";
}

export interface OwnershipReactiveAdapter {
  effect(fn: UseEffectFn, options?: OwnershipReactiveEffectOptions): Cleanup;

  /**
   * Runs `fn` while plain reactive helpers can register their cleanup with the
   * provided receiver. Passing `null` intentionally creates a cleanup boundary.
   */
  withCleanupScope<T>(
    registrar: OwnershipCleanupRegistrar | null,
    fn: () => T,
  ): T;
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

const noopCleanup: Cleanup = () => {};

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
  ): T =>
    runWithScope(owner, scope, () =>
      adapter.withCleanupScope(
        (cleanup) => addCleanup(scope, cleanup),
        fn,
      ),
    );

  const useEffect = (
    options: OwnedEffectOptions,
    fn: UseEffectFn,
  ): Cleanup => {
    const { owner } = options;
    const scope = owner.currentOwner;

    if (scope !== null && isShuttingDown(scope)) {
      if (__DEV__) throw new Error("useEffect in disposed scope");
      return noopCleanup;
    }

    return adapter.withCleanupScope(null, () => {
      const gate: EffectStartGate = { skip: true };

      const dispose = adapter.effect(() => {
        const prevGate = currentStartGate;
        currentStartGate = gate;

        try {
          return runWithOwner(owner, scope, fn);
        } finally {
          currentStartGate = prevGate;
          gate.skip = false;
        }
      }, options);

      if (scope !== null) addCleanup(scope, dispose);

      return dispose;
    });
  };

  return Object.freeze({
    onEffectStart,
    useEffect,
    runInOwnershipScope,
  });
}

export const reflexOwnershipBridge: OwnershipReactiveBridge =
  createOwnershipReactiveBridge({
    effect(fn, options) {
      const priority = options?.priority;
      const phase = options?.phase;

      if (priority !== undefined || phase === "render") {
        return effectRanked(fn, { priority, phase });
      }

      return effect(fn);
    },

    withCleanupScope: withEffectCleanupScope,
  });

export const {
  onEffectStart,
  runInOwnershipScope,
  useEffect: useOwnedEffect,
} = reflexOwnershipBridge;
