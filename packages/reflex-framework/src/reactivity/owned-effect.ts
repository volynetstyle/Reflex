import type { Cleanup } from "../types/core";
import {
  createWatcher,
  disposeWatcher,
  runWatcher,
} from "@volynets/reflex-runtime";
import { addCleanup } from "../ownership/ownership.cleanup";
import { isShuttingDown } from "../ownership/ownership.meta";
import type { OwnershipNode } from "../ownership/ownership.node";
import {
  runWithOwner,
  type OwnerContext,
} from "../ownership/ownership.scope";

export type OwnedEffectFn = () => void | Cleanup;

/** @deprecated Use `OwnedEffectFn`. */
export type UseEffectFn = OwnedEffectFn;

const noopCleanup: Cleanup = () => {};

export function createOwnedEffect(
  owner: OwnerContext,
  node: OwnershipNode | null,
  fn: OwnedEffectFn,
): Cleanup {
  if (node !== null && isShuttingDown(node)) {
    if (__DEV__) throw new Error("createOwnedEffect in disposed node");
    return noopCleanup;
  }

  const watcher = createWatcher(() => runWithOwner(owner, node, fn));

  try {
    runWatcher(watcher);
  } catch (error) {
    disposeWatcher(watcher);
    throw error;
  }

  const dispose: Cleanup = () => disposeWatcher(watcher);

  if (node !== null) {
    if (isShuttingDown(node)) {
      dispose();
    } else {
      addCleanup(node, dispose);
    }
  }

  return dispose;
}
