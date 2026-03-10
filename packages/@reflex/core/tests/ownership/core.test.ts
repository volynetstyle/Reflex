/**
 * @file core.test.ts
 *
 * Core ownership tests using testkit.
 * Demonstrates reduced boilerplate while maintaining full coverage of:
 *   - Structural invariants (I)
 *   - Context invariants (II)
 *   - Cleanup invariants (III)
 *   - Disposal order (IV)
 *   - State safety (V)
 *   - Scope safety (VI)
 *   - Context chain safety (VII)
 *   - Error resilience (VIII)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createOwner,
  buildOwnershipTree,
  createSiblings,
  createChain,
  assertSiblingChain,
  assertDetached,
  assertDisposed,
  assertAlive,
  assertContextIsolation,
  assertContextInheritance,
  assertSubtreeIntegrity,
  collectChildren,
  collectAllNodes,
  assertPrototypePollutionGuard,
  scenarioReparenting,
  scenarioMultiAppend,
  scenarioCleanupOrder,
  scenarioCleanupErrorResilience,
  scenarioContextChain,
  scenarioScopeNesting,
  scenarioBulkRemoval,
  scenarioMutationAfterDisposal,
} from "../../src/testkit";
import { createOwnershipScope } from "../../src/ownership/ownership.scope";

/**
 * I. Structural Invariants
 */
describe("I. Structural Invariants", () => {
  it("I1: Single parent (reparenting detaches from old parent)", () => {
    const p1 = createOwner();
    const p2 = createOwner();
    const c = createOwner(null);

    scenarioReparenting(p1, p2, c);
  });

  it("I2: Sibling chain consistency", () => {
    const parent = createOwner();
    scenarioMultiAppend(parent, 10);
  });

  it("I3: Child count accuracy", () => {
    const parent = createOwner();
    for (let i = 0; i < 50; i++) {
      parent.createChild();
    }

    assertSiblingChain(parent);

    const kids = collectChildren(parent);
    for (let i = 0; i < kids.length; i += 3) {
      kids[i]!.removeFromParent();
    }

    assertSiblingChain(parent);
  });

  it("I4: Safe reparenting preserves both lists", () => {
    const p1 = createOwner();
    const p2 = createOwner();

    const kids = createSiblings(p1, 10);
    const mid = kids[5]!;
    p2.appendChild(mid);

    assertSiblingChain(p1);
    assertSiblingChain(p2);
    expect(collectChildren(p2)).toEqual([mid]);
  });

  it("I5: Orphan removal", () => {
    const p = createOwner();
    const c = p.createChild();

    c.removeFromParent();

    assertDetached(c);
    assertSiblingChain(p);
  });

  it("I6: Removal safe when child not owned by parent", () => {
    const p = createOwner();
    const other = createOwner();
    const c = other.createChild();

    expect(() => p.appendChild(c)).not.toThrow();
    expect(c._parent).toBe(p);

    assertSiblingChain(p);
    assertSiblingChain(other);
  });
});

/**
 * II. Context Invariants
 */
describe("II. Context Invariants", () => {
  it("II1: Lazy context initialization", () => {
    const o = createOwner();
    expect(o._context).toBeNull();

    const ctx = o.getContext();
    expect(ctx).toBeDefined();
    expect(o._context).not.toBeNull();
  });

  it("II2: Inheritance without mutation", () => {
    const parent = createOwner();
    const c1 = parent.createChild();
    const c2 = parent.createChild();

    assertContextInheritance(parent, c1, "shared", 1);
    assertContextInheritance(parent, c2, "shared", 1);

    assertContextIsolation(parent, c1, "shared", 1, 10);
    assertContextIsolation(parent, c2, "shared", 1, 20);
  });

  it("II3: Forbidden prototype keys rejected", () => {
    const o = createOwner();
    assertPrototypePollutionGuard(o);
  });

  it("II4: Self-reference prevention", () => {
    const o = createOwner();
    expect(() => o.provide("self", o)).toThrow();
  });

  it("II5: Symbol keys supported", () => {
    const o = createOwner();
    const k = Symbol("k") as unknown as any;

    o.provide(k, 123);
    expect(o.inject<number>(k)).toBe(123);
    expect(o.hasOwnContextKey(k)).toBe(true);
  });

  it("II6: Missing keys return undefined", () => {
    const o = createOwner();
    expect(o.inject("missing")).toBeUndefined();
    expect(o.hasOwnContextKey("missing")).toBe(false);
  });

  it("II7: Null/undefined values preserved", () => {
    const o = createOwner();
    o.provide("null", null);
    o.provide("undef", undefined);

    expect(o.inject("null")).toBeNull();
    expect(o.inject("undef")).toBeUndefined();
    expect(o.hasOwnContextKey("null")).toBe(true);
    expect(o.hasOwnContextKey("undef")).toBe(true);
  });
});

/**
 * III. Cleanup Invariants
 */
describe("III. Cleanup Invariants", () => {
  it("III1: Lazy cleanup allocation", () => {
    const o = createOwner();
    expect(o._cleanups).toBeNull();

    o.onCleanup(() => {});
    expect(Array.isArray(o._cleanups)).toBe(true);
  });

  it("III2: LIFO cleanup order", () => {
    const o = createOwner();
    const [order] = scenarioCleanupOrder(o);
    expect(order).toEqual([3, 2, 1]);
  });

  it("III3: Idempotent dispose", () => {
    const o = createOwner();
    const spy = vi.fn();

    o.onCleanup(spy);
    o.dispose();
    o.dispose();
    o.dispose();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("III4: Error resilience", () => {
    const o = createOwner();
    const { executed, errorLogged } = scenarioCleanupErrorResilience(o);

    expect(executed.length).toBe(2);
    expect(errorLogged).toBe(true);
  });
});

/**
 * IV. Disposal Order & Tree Safety
 */
describe("IV. Disposal Order & Tree Safety", () => {
  it("IV1: Post-order traversal (children before parents)", () => {
    const root = createOwner();
    const c1 = root.createChild();
    const c2 = root.createChild();
    const g = c1.createChild();

    const order: string[] = [];

    g.onCleanup(() => order.push("grandchild"));
    c1.onCleanup(() => order.push("child1"));
    c2.onCleanup(() => order.push("child2"));
    root.onCleanup(() => order.push("root"));

    root.dispose();

    expect(order.indexOf("grandchild")).toBeLessThan(order.indexOf("child1"));
    expect(order.indexOf("child1")).toBeLessThan(order.indexOf("root"));
    expect(order.indexOf("child2")).toBeLessThan(order.indexOf("root"));
  });

  it("IV2: Skip already disposed nodes", () => {
    const root = createOwner();
    const c1 = root.createChild();
    const c2 = root.createChild();

    const spy1 = vi.fn();
    const spy2 = vi.fn();

    c1.onCleanup(spy1);
    c2.onCleanup(spy2);

    c1.dispose();
    root.dispose();

    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);
  });

  it("IV3: Full structural cleanup", () => {
    const root = createOwner();
    const child = root.createChild();

    root.provide("x", 1);
    root.onCleanup(() => {});
    child.onCleanup(() => {});

    root.dispose();

    assertDisposed(root);
    assertDisposed(child);
  });
});

/**
 * V. OwnershipState Invariants
 */
describe("V. OwnershipState Invariants", () => {
  it("V1: Mutations after dispose are safe", () => {
    const { disposedParent, orphan } =
      scenarioMutationAfterDisposal(createOwner());

    expect(disposedParent.isDisposed).toBe(true);
    expect(orphan._parent).toBeNull();
  });

  it("V2: removeFromParent on disposed parent safe", () => {
    const p = createOwner();
    const c = p.createChild();

    p.dispose();

    expect(() => c.removeFromParent()).not.toThrow();
    expect(c._parent).toBeNull();
  });
});

/**
 * VI. Scope Safety
 */
describe("VI. Scope Safety", () => {
  let scope: ReturnType<typeof createOwnershipScope>;

  beforeEach(() => {
    scope = createOwnershipScope();
  });

  afterEach(() => {
    expect(scope.getOwner()).toBeNull();
  });

  it("VI1: Scope isolation with error recovery", () => {
    const o = createOwner();

    expect(() => {
      scope.withOwner(o, () => {
        throw new Error("boom");
      });
    }).toThrow("boom");

    expect(scope.getOwner()).toBeNull();
  });

  it("VI2: Nested scope restore", () => {
    const outer = createOwner();
    const inner = createOwner();

    scope.withOwner(outer, () => {
      expect(scope.getOwner()).toBe(outer);

      scope.withOwner(inner, () => {
        expect(scope.getOwner()).toBe(inner);
      });

      expect(scope.getOwner()).toBe(outer);
    });

    expect(scope.getOwner()).toBeNull();
  });

  it("VI3: createScope defaults to current owner", () => {
    const parent = createOwner();
    let created: any = null;

    scope.withOwner(parent, () => {
      scope.createScope(() => {
        created = scope.getOwner();
      });
    });

    expect(created).not.toBeNull();
    expect(created._parent).toBe(parent);
    expect(scope.getOwner()).toBeNull();
  });

  it("VI4: createScope works without owner", () => {
    let root: any = null;

    scope.createScope(() => {
      root = scope.getOwner();
    });

    expect(root).not.toBeNull();
    expect(root._parent).toBeNull();
    expect(scope.getOwner()).toBeNull();
  });

  it("VI5: createScope restores on error", () => {
    const parent = createOwner();

    expect(() => {
      scope.withOwner(parent, () => {
        scope.createScope(() => {
          throw new Error("scope error");
        });
      });
    }).toThrow("scope error");

    expect(scope.getOwner()).toBeNull();
  });
});

/**
 * VII. Context Chain Safety
 */
describe("VII. Context Chain Safety", () => {
  it("VII1: Own vs inherited context keys", () => {
    const p = createOwner();
    const c = p.createChild();

    p.provide("k", 1);

    expect(c.hasOwnContextKey("k")).toBe(false);
    expect(c.inject<number>("k")).toBe(1);

    c.provide("k", 2);
    expect(c.hasOwnContextKey("k")).toBe(true);
    expect(c.inject<number>("k")).toBe(2);
    expect(p.inject<number>("k")).toBe(1);
  });

  it("VII2: Context chain after structural mutations", () => {
    const p1 = createOwner();
    const p2 = createOwner();
    const c = p1.createChild();

    p1.provide("x", 1);
    expect(c.inject<number>("x")).toBe(1);

    p2.appendChild(c);

    // After reparent: context freezes (created at child initialization)
    expect(c.inject<number>("x")).toBeUndefined();
  });

  it("VII3: Deep context chain", () => {
    const { nodes } = scenarioContextChain(5);

    // verify nodes are created and linked
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i]._parent).toBe(nodes[i - 1]);
    }
  });
});

/**
 * VIII. Error Strategy & Resilience
 */
describe("VIII. Error Strategy", () => {
  it("VIII1: Dispose resilience with errors", () => {
    const root = createOwner();
    const child = root.createChild();

    child.onCleanup(() => {
      throw new Error("child cleanup");
    });
    root.onCleanup(() => {});

    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() => root.dispose()).not.toThrow();

    consoleError.mockRestore();

    assertDisposed(root);
    assertDisposed(child);
  });

  it("VIII2: Bulk operations maintain invariants", () => {
    const root = createOwner();
    const pool: any[] = [root];

    for (let i = 0; i < 100; i++) {
      const r = i % 5;

      if (r === 0 && pool.length > 1) {
        const idx = Math.floor(Math.random() * (pool.length - 1));
        const parent = pool[idx];
        const child = parent.createChild();
        pool.push(child);
      } else if (r === 1 && pool.length > 2) {
        const idx = Math.floor(Math.random() * (pool.length - 1)) + 1;
        pool[idx].removeFromParent();
        pool.splice(idx, 1);
      } else if (r === 2) {
        const idx = Math.floor(Math.random() * pool.length);
        pool[idx].provide("key", Math.random());
      } else if (r === 3 && pool.length > 1) {
        const idx = Math.floor(Math.random() * pool.length);
        const target = pool[idx];
        const donor = pool[(idx + 1) % pool.length];
        if (target !== donor && target._parent !== donor) {
          donor.appendChild(target);
        }
      }
    }

    // verify final tree integrity
    assertSubtreeIntegrity(root);

    root.dispose();
    assertDisposed(root);
  });
});

/**
 * Advanced: Tree Building & Complex Scenarios
 */
describe("Advanced: Complex Trees", () => {
  it("declarative tree building", () => {
    const root = buildOwnershipTree({
      context: { root: true },
      cleanups: 1,
      children: [
        {
          context: { branch: "a" },
          children: [
            {
              children: [],
            },
            {
              children: [],
            },
          ],
        },
        {
          context: { branch: "b" },
          children: [
            {
              children: [
                {
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    });

    assertSubtreeIntegrity(root);

    const allNodes = collectAllNodes(root);
    expect(allNodes.length).toBe(7); // root + 5 children

    root.dispose();
    assertDisposed(root);
  });

  it("chain disposal safety", () => {
    const chain = createChain(100);
    const allBefore = collectAllNodes(chain);

    chain.dispose();

    for (const node of allBefore) {
      assertDisposed(node);
    }
  });

  it("bulk sibling removal", () => {
    const parent = createOwner();
    const { removed, remaining } = scenarioBulkRemoval(parent, 30, 3);

    expect(removed.length).toBe(10);
    expect(remaining.length).toBe(20);
    assertSiblingChain(parent);
  });
});
