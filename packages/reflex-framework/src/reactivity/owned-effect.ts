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

  let closed = false;
  let currentRun: OwnershipNode | null = null;

  const watcher = createWatcher(() => {
    // Logical close: a queued or re-validated run of a closed effect is inert.
    if (closed) return;
    return runWithOwner(owner, node, () =>
      usingOwnershipNode(owner, (executionNode) => {
        currentRun = executionNode;
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
    );
  });

  try {
    runInOwnerDomain(owner, () => runWatcher(watcher));
  } catch (error) {
    disposeWatcher(watcher);
    throw error;
  }

  const domain = owner.domain;
  const dispose: Cleanup =
    domain == null
      ? () => disposeWatcher(watcher)
      : () => {
          if (closed) return;
          closed = true;
          // Phase 1, synchronous: user cleanups keep their established order.
          const run = currentRun;
          currentRun = null;
          if (run !== null) {
            runInOwnerDomain(owner, () => disposeOwnershipNode(run));
          }
          // Phase 2: graph unlink at the domain's next safe point (L2).
          domain.teardown(() => disposeWatcher(watcher));
        };

  if (node !== null) {
    if (isShuttingDown(node)) {
      dispose();
    } else {
      addCleanup(node, dispose);
    }
  }

  return dispose;
}
