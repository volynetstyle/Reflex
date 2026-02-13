/**
 * @file testkit/scenarios.ts
 *
 * Composable test scenarios and matchers for complex ownership operations.
 * Reduces boilerplate by capturing common test patterns.
 */

import { OwnershipNode } from "../ownership/ownership.node";
import { OwnershipScope, createOwnershipScope } from "../ownership/ownership.scope";
import { expect, vi } from "vitest";
import {
  collectChildren,
  assertSiblingChain,
  collectAllNodes,
} from "./validators";

/**
 * Scenario: Single parent adoption
 * When child is appended to new parent, it should detach from old parent.
 */
export function scenarioReparenting(
  oldParent: OwnershipNode,
  newParent: OwnershipNode,
  child: OwnershipNode,
): void {
  oldParent.appendChild(child);
  expect(child._parent).toBe(oldParent);

  newParent.appendChild(child);
  expect(child._parent).toBe(newParent);

  expect(collectChildren(oldParent)).not.toContain(child);
  expect(collectChildren(newParent)).toContain(child);

  assertSiblingChain(oldParent);
  assertSiblingChain(newParent);
}

/**
 * Scenario: Multiple appends maintain order
 */
export function scenarioMultiAppend(parent: OwnershipNode, count: number): void {
  const nodes: OwnershipNode[] = [];
  for (let i = 0; i < count; i++) {
    const child = new OwnershipNode();
    parent.appendChild(child);
    nodes.push(child);
  }

  const collected = collectChildren(parent);
  expect(collected).toEqual(nodes);
  assertSiblingChain(parent);
}

/**
 * Scenario: LIFO cleanup order
 * Verifies that cleanups execute in reverse registration order.
 */
export function scenarioCleanupOrder(
  node: OwnershipNode,
): [number[], OwnershipNode] {
  const order: number[] = [];

  node.onCleanup(() => order.push(1));
  node.onCleanup(() => order.push(2));
  node.onCleanup(() => order.push(3));

  node.dispose();
  expect(order).toEqual([3, 2, 1]);

  return [order, node];
}

/**
 * Scenario: Error resilience in cleanup
 * Ensures that cleanup errors don't prevent other cleanups from running.
 */
export function scenarioCleanupErrorResilience(
  node: OwnershipNode,
): { executed: number[]; errorLogged: boolean } {
  const executed: number[] = [];
  let errorLogged = false;

  node.onCleanup(() => executed.push(1));
  node.onCleanup(() => {
    throw new Error("cleanup error");
  });
  node.onCleanup(() => executed.push(3));

  const consoleError = vi
    .spyOn(console, "error")
    .mockImplementation(() => {
      errorLogged = true;
    });

  expect(() => node.dispose()).not.toThrow();

  consoleError.mockRestore();

  expect(executed).toEqual([1, 3]);
  return { executed, errorLogged };
}

/**
 * Scenario: Context inheritance chain
 * Parent -> Child -> Grandchild with override at each level.
 */
export function scenarioContextChain(
  depth: number,
): { nodes: OwnershipNode[]; values: Map<string, number[]> } {
  const nodes: OwnershipNode[] = [];
  const values = new Map<string, number[]>();

  let current = OwnershipNode.createRoot();
  nodes.push(current);

  for (let i = 0; i < depth; i++) {
    const key = `level${i}`;
    current.provide(key, i);

    if (!values.has(key)) {
      values.set(key, []);
    }
    values.get(key)!.push(i);

    const child = current.createChild();
    nodes.push(child);
    current = child;
  }

  // verify inheritance chain
  for (let level = 0; level < nodes.length; level++) {
    const node = nodes[level]!;
    for (let i = 0; i < level; i++) {
      const key = `level${i}`;
      expect(node.inject<number>(key)).toBe(i);
    }
  }

  return { nodes, values };
}

/**
 * Scenario: Scope nesting with error recovery
 */
export function scenarioScopeNesting(
  rootOwner: OwnershipNode,
  throwInInner: boolean = false,
): { outer: OwnershipNode | null; inner: OwnershipNode | null } {
  const scope = createOwnershipScope();
  let capturedOuter: OwnershipNode | null = null;
  let capturedInner: OwnershipNode | null = null;

  scope.withOwner(rootOwner, () => {
    capturedOuter = scope.getOwner();

    try {
      scope.withOwner(rootOwner.createChild(), () => {
        capturedInner = scope.getOwner();
        if (throwInInner) throw new Error("inner error");
      });
    } catch (e) {
      // expected
    }

    // scope should restore to outer after inner completes or throws
    expect(scope.getOwner()).toBe(capturedOuter);
  });

  // scope should restore to null
  expect(scope.getOwner()).toBeNull();

  return { outer: capturedOuter, inner: capturedInner };
}

/**
 * Scenario: Post-order disposal (children dispose before parents)
 */
export function scenarioPostOrderDisposal(root: OwnershipNode): {
  disposalOrder: OwnershipNode[];
  allNodes: OwnershipNode[];
} {
  const disposalOrder: OwnershipNode[] = [];

  // wrap disposal to track order
  const nodes = collectAllNodes(root);
  for (const node of nodes) {
    const originalDispose = node.dispose.bind(node);
    node.dispose = function () {
      disposalOrder.push(this);
      originalDispose();
    };
  }

  root.dispose();

  // post-order: children first, then parents
  expect(disposalOrder).toEqual(nodes);

  return { disposalOrder, allNodes: nodes };
}

/**
 * Scenario: Bulk sibling removal
 */
export function scenarioBulkRemoval(
  parent: OwnershipNode,
  count: number,
  removeEvery: number,
): { removed: OwnershipNode[]; remaining: OwnershipNode[] } {
  const children: OwnershipNode[] = [];
  for (let i = 0; i < count; i++) {
    children.push(parent.createChild());
  }

  const removed: OwnershipNode[] = [];
  for (let i = 0; i < children.length; i += removeEvery) {
    const child = children[i]!;
    child.removeFromParent();
    removed.push(child);
  }

  const remaining = collectChildren(parent);
  assertSiblingChain(parent);

  return { removed, remaining };
}

/**
 * Scenario: Mutation after disposal (should be safe)
 */
export function scenarioMutationAfterDisposal(
  parent: OwnershipNode,
): { disposedParent: OwnershipNode; orphan: OwnershipNode } {
  const child = parent.createChild();
  parent.dispose();

  const newOrphan = new OwnershipNode();

  // all should be no-op or throw safely
  expect(() => parent.appendChild(newOrphan)).not.toThrow();
  expect(() => parent.onCleanup(() => {})).not.toThrow();
  expect(() => parent.provide("key", "value")).not.toThrow();

  // no structural mutation occurred
  expect(newOrphan._parent).toBeNull();
  expect(parent._firstChild).toBeNull();

  return { disposedParent: parent, orphan: newOrphan };
}

/**
 * Scenario: Context injection after reparenting
 * Design choice: context freezes at child creation or follows parent?
 */
export function scenarioContextAfterReparent(
  parent1: OwnershipNode,
  parent2: OwnershipNode,
): {
  child: OwnershipNode;
  originalValue: string;
  afterReparent: string | undefined;
} {
  parent1.provide("inherited", "from-parent1");
  const child = parent1.createChild();
  const originalValue = child.inject<string>("inherited")!;

  parent2.appendChild(child);
  const afterReparent = child.inject<string>("inherited");

  return { child, originalValue, afterReparent };
}
