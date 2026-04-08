import { effect, withEffectCleanupRegistrar } from "@volynets/reflex";
import {
  createOwnershipReactiveBridge,
  type OwnershipReactiveBridge,
} from "./bridge";

export const reflexOwnershipBridge: OwnershipReactiveBridge =
  createOwnershipReactiveBridge({
    effect,
    withCleanupRegistrar: withEffectCleanupRegistrar,
  });

export const { onEffectStart, useEffect, runInOwnershipScope } =
  reflexOwnershipBridge;

export * from "./bridge";
