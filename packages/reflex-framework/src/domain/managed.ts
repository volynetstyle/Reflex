import {
  getActiveExecutionDomain,
  type ExecutionDomain,
} from "@volynets/reflex-runtime";
import { runInDomain, runInOwnerDomain } from "./enter";
import { disposeOwnershipNode } from "../ownership/ownership.cleanup";
import { isShuttingDown } from "../ownership/ownership.meta";
import type { OwnershipNode } from "../ownership/ownership.node";
import {
  createOwnerContext,
  createOwnershipNode,
  getActiveOwnerContext,
  runWithOwner,
  type OwnerContext,
} from "../ownership/ownership.scope";

/**
 * The managed boundary: enter the owner's execution domain, then restore the
 * owner/node. Owner changes inside one domain never reload the register bank.
 */
export function runManaged<T>(
  owner: OwnerContext,
  node: OwnershipNode | null,
  fn: () => T,
): T {
  return runInOwnerDomain(owner, () => runWithOwner(owner, node, fn));
}

/**
 * Captures the active domain, owner and owner node, and returns a callback
 * that restores them. Use it for callbacks that run later from outside
 * (events, timers, async continuations); plain reactive callbacks don't need
 * it and keep their existing cost.
 */
export function bindManaged<A extends unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => R {
  const owner = getActiveOwnerContext();
  const node = owner?.currentNode ?? null;
  const domain = owner?.domain ?? getActiveExecutionDomain() ?? null;

  if (owner === null) {
    return (...args: A): R => runInDomain(domain, () => fn(...args));
  }

  return (...args: A): R =>
    runInDomain(domain, () => runWithOwner(owner, node, () => fn(...args)));
}

/** An application root: one execution domain plus one ownership tree. */
export interface ManagedRoot {
  readonly domain: ExecutionDomain;
  readonly owner: OwnerContext;
  readonly node: OwnershipNode;
  readonly disposed: boolean;
  run<T>(fn: () => T): T;
  /**
   * Disposes the ownership tree synchronously, then closes the domain.
   * Graph teardown requested during managed execution runs at the next
   * safe point (L2).
   */
  dispose(): void;
}

export function createManagedRoot(domain: ExecutionDomain): ManagedRoot {
  const owner = createOwnerContext(domain);
  const node = createOwnershipNode();

  const root: ManagedRoot = {
    domain,
    owner,
    node,
    get disposed() {
      return isShuttingDown(node);
    },
    run<T>(fn: () => T): T {
      if (isShuttingDown(node)) {
        throw new Error("The managed root is disposed.");
      }
      return runManaged(owner, node, fn);
    },
    dispose(): void {
      if (isShuttingDown(node)) return;
      try {
        runInDomain(domain, () => disposeOwnershipNode(node));
      } finally {
        domain.close();
      }
    },
  };

  return root;
}
