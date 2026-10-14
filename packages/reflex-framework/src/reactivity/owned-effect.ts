import type { Cleanup } from "../types/core";
import {
  createWatcher,
  disposeWatcher,
  runWatcher,
} from "@volynets/reflex-runtime";
import {
  addCleanup,
  disposeOwnershipNode,
} from "../ownership/ownership.cleanup";
import { isShuttingDown } from "../ownership/ownership.meta";
import type { OwnershipNode } from "../ownership/ownership.node";
import {
  runWithOwner,
  usingOwnershipNode,
  type OwnerContext,
} from "../ownership/ownership.scope";
import { runInOwnerDomain } from "../domain/enter";

export type OwnedEffectFn = () => void | Cleanup;

/**
 * Deprecated name for the callback type accepted by an owned effect.
 *
 * @deprecated Use `OwnedEffectFn`.
 */
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
  if (owner.domain?.closed) {
    if (__DEV__) throw new Error("createOwnedEffect in a closed domain");
    return noopCleanup;
  }

  const watcher = createWatcher(() =>
    runWithOwner(owner, node, () =>
      usingOwnershipNode(owner, (executionNode) => {
        const cleanup = fn();
        if (cleanup !== undefined) {
          if (isShuttingDown(executionNode)) cleanup();
          // Cleanup sees the run's environment, wherever disposal starts.
          else
            addCleanup(executionNode, () =>
              runInOwnerDomain(owner, () =>
                runWithOwner(owner, executionNode, cleanup),
              ),
            );
        }
        return () =>
          runInOwnerDomain(owner, () => disposeOwnershipNode(executionNode));
      }),
    ),
  );

  try {
    runInOwnerDomain(owner, () => runWatcher(watcher));
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
