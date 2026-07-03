import type { Cleanup } from "../types/core";
import { addCleanup } from "../ownership/ownership.cleanup";
import { isShuttingDown } from "../ownership/ownership.meta";
import type { OwnershipNode } from "../ownership/ownership.node";
import {
  runWithOwner,
  type OwnerContext,
} from "../ownership/ownership.scope";
import { createRuntimeEffect } from "./runtime-effect";

export type OwnedEffectFn = () => void | Cleanup;

/** @deprecated Use `OwnedEffectFn`. */
export type UseEffectFn = OwnedEffectFn;

const noopCleanup: Cleanup = () => {};

export function createOwnedEffect(
  owner: OwnerContext,
  scope: OwnershipNode | null,
  fn: OwnedEffectFn,
): Cleanup {
  if (scope !== null && isShuttingDown(scope)) {
    if (__DEV__) throw new Error("createOwnedEffect in disposed scope");
    return noopCleanup;
  }

  const dispose = createRuntimeEffect(() => runWithOwner(owner, scope, fn));

  if (scope !== null) {
    console.log("DEBUG owned add", scope.meta, scope.parent !== null);
    if (isShuttingDown(scope)) {
      dispose();
    } else {
      addCleanup(scope, dispose);
    }
  }

  return dispose;
}
