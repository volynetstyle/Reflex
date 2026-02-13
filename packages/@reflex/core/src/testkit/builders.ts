/**
 * @file testkit/builders.ts
 *
 * Test data builders and factories for ownership testing.
 * Provides reusable construction patterns for common test scenarios.
 */

import { OwnershipNode } from "../ownership/ownership.node";
import { OwnershipScope, createOwnershipScope } from "../ownership/ownership.scope";

/**
 * Create an owner node (root or child of parent).
 * Replaces inline boilerplate in tests.
 */
export function createOwner(parent: OwnershipNode | null = null): OwnershipNode {
  if (parent === null) {
    return OwnershipNode.createRoot();
  }
  return parent.createChild();
}

/**
 * Build a tree structure for testing.
 * Returns the root node with children attached according to spec.
 *
 * @example
 * const root = buildOwnershipTree({
 *   children: [
 *     { children: [] },
 *     { children: [] },
 *     { children: [{ children: [] }] }
 *   ]
 * });
 */
export interface TreeSpec {
  parent?: OwnershipNode;
  children?: TreeSpec[];
  context?: Record<string, unknown>;
  cleanups?: number; // number of cleanup handlers to register
}

export function buildOwnershipTree(spec: TreeSpec): OwnershipNode {
  const node = createOwner(spec.parent ?? null);

  // apply context if specified
  if (spec.context) {
    for (const [key, value] of Object.entries(spec.context)) {
      node.provide(key, value);
    }
  }

  // register cleanups if specified
  if (spec.cleanups && spec.cleanups > 0) {
    for (let i = 0; i < spec.cleanups; i++) {
      node.onCleanup(() => {});
    }
  }

  // recursively build children
  if (spec.children) {
    for (const childSpec of spec.children) {
      const child = buildOwnershipTree({ ...childSpec, parent: node });
      // note: child is already appended via createChild
    }
  }

  return node;
}

/**
 * Create a list of sibling nodes under a parent.
 * Useful for testing sibling-chain operations.
 */
export function createSiblings(
  parent: OwnershipNode,
  count: number,
): OwnershipNode[] {
  const siblings: OwnershipNode[] = [];
  for (let i = 0; i < count; i++) {
    siblings.push(parent.createChild());
  }
  return siblings;
}

/**
 * Create a linear chain (root -> child -> grandchild -> ...).
 * Useful for testing depth-first operations.
 */
export function createChain(depth: number): OwnershipNode {
  let root = OwnershipNode.createRoot();
  let current = root;

  for (let i = 1; i < depth; i++) {
    const next = current.createChild();
    current = next;
  }

  return root;
}

/**
 * Create a scope with optional parent context.
 * Simplifies scope-based test setup.
 */
export function createTestScope(
  parent: OwnershipNode | null = null,
): OwnershipScope {
  const scope = createOwnershipScope();
  if (parent !== null) {
    scope.withOwner(parent, () => {});
  }
  return scope;
}
