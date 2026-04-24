import { effect, effectRanked, withEffectCleanupRegistrar } from "@volynets/reflex";
import {
  createOwnershipReactiveBridge,
  type OwnershipReactiveBridge,
} from "./bridge";

export const reflexOwnershipBridge: OwnershipReactiveBridge =
  createOwnershipReactiveBridge({
    effect(fn, options) {
      if (options?.priority !== undefined) {
        return effectRanked(fn, { priority: options.priority });
      }

      return effect(fn);
    },
    withCleanupRegistrar: withEffectCleanupRegistrar,
  });

export const { onEffectStart, useEffect, runInOwnershipScope } =
  reflexOwnershipBridge;

export * from "./bridge";
