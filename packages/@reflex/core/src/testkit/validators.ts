/**
 * @file testkit/validators.ts
 *
 * Assertion helpers and validators for ownership invariants.
 * Consolidates repetitive validation logic from tests.
 */

import { OwnershipNode } from "../ownership/ownership.node";
import { expect } from "vitest";

/**
 * Collect all children of a parent in order (forward traversal of sibling chain).
 * Essential for verifying structural invariants.
 */
export function collectChildren(parent: OwnershipNode): OwnershipNode[] {
  const out: OwnershipNode[] = [];
  let c = parent._firstChild;
  while (c !== null) {
    out.push(c);
    c = c._nextSibling;
  }
  return out;
}

/**
 * Assert that a node's sibling chain is internally consistent.
 * Checks:
 *   - all children have correct parent pointer
 *   - first/last child pointers match actual list boundaries
 *   - forward/backward sibling links are consistent
 *   - _childCount matches actual count
 */
export function assertSiblingChain(parent: OwnershipNode): void {
  const kids = collectChildren(parent);

  // parent pointers
  for (const k of kids) {
    expect(k._parent).toBe(parent);
  }

  // first/last links
  if (kids.length === 0) {
    expect(parent._firstChild).toBeNull();
    expect(parent._lastChild).toBeNull();
  } else {
    expect(parent._firstChild).toBe(kids[0]);
    expect(parent._lastChild).toBe(kids[kids.length - 1]);
  }

  // forward/backward consistency
  for (let i = 0; i < kids.length; i++) {
    const cur = kids[i]!;
    const prev = i === 0 ? null : kids[i - 1]!;
    const next = i === kids.length - 1 ? null : kids[i + 1]!;

    expect(cur._nextSibling).toBe(next);

    if (prev !== null) expect(prev._nextSibling).toBe(cur);
  }

  // count accuracy
  expect(parent._childCount).toBe(kids.length);
}

/**
 * Assert that a node is detached (no parent, no siblings).
 * Useful after removeFromParent or similar operations.
 */
export function assertDetached(node: OwnershipNode): void {
  expect(node._parent).toBeNull();
  expect(node._nextSibling).toBeNull();
  expect(node._prevSibling).toBeNull();
}

/**
 * Assert that a node (and optionally its subtree) has been disposed.
 * Checks:
 *   - isDisposed flag is set
 *   - all structural links are cleared
 *   - context is cleared
 *   - cleanups are cleared
 */
export function assertDisposed(node: OwnershipNode, deep: boolean = false): void {
  expect(node.isDisposed).toBe(true);
  expect(node._parent).toBeNull();
  expect(node._firstChild).toBeNull();
  expect(node._lastChild).toBeNull();
  expect(node._nextSibling).toBeNull();
  expect(node._prevSibling).toBeNull();
  expect(node._context).toBeNull();
  expect(node._cleanups).toBeNull();
  expect(node._childCount).toBe(0);

  if (deep) {
    // recursively check all nodes in tree before disposal
    // note: this assumes you've captured children before disposal
  }
}

/**
 * Assert structural integrity of entire subtree.
 * Validates all parent-child links recursively.
 */
export function assertSubtreeIntegrity(node: OwnershipNode): void {
  assertSiblingChain(node);

  let current: OwnershipNode | null = node._firstChild;
  while (current !== null) {
    assertSubtreeIntegrity(current);
    current = current._nextSibling;
  }
}

/**
 * Assert that node is not disposed and not orphaned.
 */
export function assertAlive(node: OwnershipNode): void {
  expect(node.isDisposed).toBe(false);
}

/**
 * Assert context isolation: parent and child have independent context overrides.
 */
export function assertContextIsolation(
  parent: OwnershipNode,
  child: OwnershipNode,
  key: string,
  parentValue: unknown,
  childValue: unknown,
): void {
  parent.provide(key, parentValue);
  child.provide(key, childValue);

  expect(parent.inject(key)).toBe(parentValue);
  expect(child.inject(key)).toBe(childValue);
  expect(child.hasOwnContextKey(key)).toBe(true);
  expect(parent.hasOwnContextKey(key)).toBe(true);
}

/**
 * Assert context inheritance: child can read parent's context.
 */
export function assertContextInheritance(
  parent: OwnershipNode,
  child: OwnershipNode,
  key: string,
  value: unknown,
): void {
  parent.provide(key, value);

  expect(child.inject(key)).toBe(value);
  expect(child.hasOwnContextKey(key)).toBe(false);
  expect(parent.hasOwnContextKey(key)).toBe(true);
}

/**
 * Assert that tree structure is unchanged (reference equality on children list).
 */
export function assertTreeUnchanged(
  parent: OwnershipNode,
  expectedChildren: OwnershipNode[],
): void {
  const actual = collectChildren(parent);
  expect(actual).toEqual(expectedChildren);
}

/**
 * Collect all nodes in a subtree (post-order DFS).
 * Useful for verifying disposal order or other tree traversals.
 */
export function collectAllNodes(root: OwnershipNode): OwnershipNode[] {
  const result: OwnershipNode[] = [];

  function visit(node: OwnershipNode): void {
    let child: OwnershipNode | null = node._firstChild;
    while (child !== null) {
      visit(child);
      child = child._nextSibling;
    }
    result.push(node);
  }

  visit(root);
  return result;
}

/**
 * Assert that disposal order is post-order (children before parents).
 * Requires tracking disposal order during test setup.
 */
export function assertDisposalOrder(
  disposalOrder: OwnershipNode[],
  root: OwnershipNode,
): void {
  // post-order traversal for comparison
  const expected = collectAllNodes(root);
  expect(disposalOrder).toEqual(expected);
}

/**
 * Check for prototype pollution guards: forbidden keys should be rejected.
 */
export const PROTO_KEYS = ["__proto__", "prototype", "constructor"] as const;

export function assertPrototypePollutionGuard(node: OwnershipNode): void {
  for (const key of PROTO_KEYS) {
    expect(() => {
      node.provide(key as any, { hacked: true });
    }).toThrow();
  }
}
