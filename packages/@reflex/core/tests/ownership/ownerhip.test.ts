import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OwnershipService } from "../../src/ownership/ownership.node";
import {
  createOwnershipScope,
  OwnershipScope,
} from "../../src/ownership/ownership.scope";
import type { OwnershipNode } from "../../src/ownership/ownership.node";

/* ──────────────────────────────────────────────────────────────
 * Test helpers (no `any`)
 * ────────────────────────────────────────────────────────────── */

function collectChildren(parent: OwnershipNode): OwnershipNode[] {
  const out: OwnershipNode[] = [];
  let c = parent._firstChild;
  while (c !== null) {
    out.push(c);
    c = c._nextSibling;
  }
  return out;
}

function assertSiblingChain(parent: OwnershipNode): void {
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

    expect(cur._prevSibling).toBe(prev);
    expect(cur._nextSibling).toBe(next);

    if (prev !== null) expect(prev._nextSibling).toBe(cur);
    if (next !== null) expect(next._prevSibling).toBe(cur);
  }

  // count accuracy (white-box but meaningful)
  expect(parent._childCount).toBe(kids.length);
}

function assertDetached(node: OwnershipNode): void {
  expect(node._parent).toBeNull();
  expect(node._prevSibling).toBeNull();
  expect(node._nextSibling).toBeNull();
}

/**
 * Security-sensitive keys for prototype-pollution checks.
 * If your context layer is a plain object / proto-chain, these must be blocked.
 */
const PROTO_KEYS: Array<string> = ["__proto__", "prototype", "constructor"];

/* ──────────────────────────────────────────────────────────────
 * Ownership Safety Spec — Tests
 * ────────────────────────────────────────────────────────────── */

describe("Ownership Safety Spec (I–VIII)", () => {
  let service: OwnershipService;

  beforeEach(() => {
    service = new OwnershipService();
  });

  /*───────────────────────────────────────────────*
   * I. Structural Invariants
   *───────────────────────────────────────────────*/
  describe("I. Structural Invariants", () => {
    it("I1 Single Parent: child cannot have two parents after reparent", () => {
      const p1 = service.createOwner(null);
      const p2 = service.createOwner(null);
      const c = service.createOwner(null);

      service.appendChild(p1, c);
      service.appendChild(p2, c);

      // child parent updated
      expect(c._parent).toBe(p2);

      // p1 should no longer reference child
      expect(collectChildren(p1)).not.toContain(c);
      expect(p1._childCount).toBe(0);

      // p2 contains child exactly once
      const kids2 = collectChildren(p2);
      expect(kids2).toContain(c);
      expect(kids2.filter((x) => x === c).length).toBe(1);

      assertSiblingChain(p1);
      assertSiblingChain(p2);
    });

    it("I2 Sibling Chain Consistency: multi-append preserves order and links", () => {
      const p = service.createOwner(null);
      const a = service.createOwner(null);
      const b = service.createOwner(null);
      const c = service.createOwner(null);

      service.appendChild(p, a);
      service.appendChild(p, b);
      service.appendChild(p, c);

      assertSiblingChain(p);
      expect(collectChildren(p)).toEqual([a, b, c]);
    });

    it("I3 Child Count Accuracy: _childCount matches traversal", () => {
      const p = service.createOwner(null);
      for (let i = 0; i < 50; i++) service.createOwner(p);

      assertSiblingChain(p);

      // remove some
      const kids = collectChildren(p);
      for (let i = 0; i < kids.length; i += 3) {
        service.removeChild(p, kids[i]!);
      }

      assertSiblingChain(p);
    });

    it("I4 Safe Reparenting: reparent preserves integrity of both lists", () => {
      const p1 = service.createOwner(null);
      const p2 = service.createOwner(null);

      const kids: OwnershipNode[] = [];
      for (let i = 0; i < 10; i++) kids.push(service.createOwner(p1));

      // move middle one
      const mid = kids[5]!;
      service.appendChild(p2, mid);

      assertSiblingChain(p1);
      assertSiblingChain(p2);

      expect(collectChildren(p2)).toEqual([mid]);
      expect(collectChildren(p1)).not.toContain(mid);
    });

    it("I5 Orphan Removal: removeChild detaches child refs", () => {
      const p = service.createOwner(null);
      const c = service.createOwner(null);

      service.appendChild(p, c);
      service.removeChild(p, c);

      assertDetached(c);
      assertSiblingChain(p);
    });

    it("Removal is safe when child is not owned by parent (no throw, no mutation)", () => {
      const p = service.createOwner(null);
      const other = service.createOwner(null);
      const c = service.createOwner(other);

      // should not throw and should not detach from real parent
      expect(() => service.removeChild(p, c)).not.toThrow();
      expect(c._parent).toBe(other);

      assertSiblingChain(p);
      assertSiblingChain(other);
    });
  });

  /*───────────────────────────────────────────────*
   * II. Context Invariants
   *───────────────────────────────────────────────*/
  describe("II. Context Invariants", () => {
    it("II1 Lazy Context Initialization: _context stays null until first access/provide", () => {
      const o = service.createOwner(null);
      expect(o._context).toBeNull();

      // getContext should initialize
      const ctx = service.getContext(o);
      expect(ctx).toBeDefined();
      expect(o._context).not.toBeNull();
      expect(service.getContext(o)).toBe(ctx);
    });

    it("II2 Inheritance Without Mutation: child can read parent, overrides are isolated", () => {
      const parent = service.createOwner(null);
      service.provide(parent, "shared", 1);

      const c1 = service.createOwner(parent);
      const c2 = service.createOwner(parent);

      expect(service.inject<number>(c1, "shared")).toBe(1);
      expect(service.inject<number>(c2, "shared")).toBe(1);

      service.provide(c1, "shared", 10);
      service.provide(c2, "shared", 20);

      expect(service.inject<number>(parent, "shared")).toBe(1);
      expect(service.inject<number>(c1, "shared")).toBe(10);
      expect(service.inject<number>(c2, "shared")).toBe(20);
    });

    it("II3 Forbidden Prototype Keys: providing __proto__/constructor/prototype must be rejected", () => {
      const o = service.createOwner(null);

      // These tests are intentionally strict. If they fail now, it's a real vulnerability to fix.
      for (const key of PROTO_KEYS) {
        expect(() =>
          service.provide(o, key as unknown as any, { hacked: true }),
        ).toThrow();
      }
    });

    it("II4 Self Reference Prevention: cannot provide owner itself as a value", () => {
      const o = service.createOwner(null);

      // Strict: if current code does not throw yet, you should add the guard in contextProvide/provide
      expect(() => service.provide(o, "self", o)).toThrow();
    });

    it("hasOwn vs inject: distinguishes own vs inherited keys", () => {
      const parent = service.createOwner(null);
      service.provide(parent, "inherited", 1);

      const child = service.createOwner(parent);
      service.provide(child, "own", 2);

      expect(service.hasOwn(child, "own")).toBe(true);
      expect(service.hasOwn(child, "inherited")).toBe(false);

      expect(service.inject<number>(child, "inherited")).toBe(1);
      expect(service.inject<number>(child, "own")).toBe(2);
    });

    it("supports symbol keys (context keys)", () => {
      const o = service.createOwner(null);
      const k = Symbol("k") as unknown as any;

      service.provide(o, k, 123);
      expect(service.inject<number>(o, k)).toBe(123);
      expect(service.hasOwn(o, k)).toBe(true);
    });

    it("returns undefined for missing keys", () => {
      const o = service.createOwner(null);
      expect(service.inject(o, "missing")).toBeUndefined();
      expect(service.hasOwn(o, "missing")).toBe(false);
    });

    it("allows null/undefined values without breaking own-ness", () => {
      const o = service.createOwner(null);
      service.provide(o, "null", null);
      service.provide(o, "undef", undefined);

      expect(service.inject(o, "null")).toBeNull();
      expect(service.inject(o, "undef")).toBeUndefined();
      expect(service.hasOwn(o, "null")).toBe(true);
      expect(service.hasOwn(o, "undef")).toBe(true);
    });
  });

  /*───────────────────────────────────────────────*
   * III. Cleanup Invariants
   *───────────────────────────────────────────────*/
  describe("III. Cleanup Invariants", () => {
    it("III1 Lazy Cleanups: _cleanups is null until first registration", () => {
      const o = service.createOwner(null);
      expect(o._cleanups).toBeNull();

      service.onScopeCleanup(o, () => {});
      expect(o._cleanups).not.toBeNull();
      expect(Array.isArray(o._cleanups)).toBe(true);
    });

    it("III2 Order Guarantee (LIFO): cleanups run in reverse registration order", () => {
      const o = service.createOwner(null);
      const order: number[] = [];

      service.onScopeCleanup(o, () => order.push(1));
      service.onScopeCleanup(o, () => order.push(2));
      service.onScopeCleanup(o, () => order.push(3));

      service.dispose(o);
      expect(order).toEqual([3, 2, 1]);
    });

    it("III3 Idempotent Dispose: cleanups execute exactly once", () => {
      const o = service.createOwner(null);
      const spy = vi.fn();

      service.onScopeCleanup(o, spy);
      service.dispose(o);
      service.dispose(o);
      service.dispose(o);

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("III4 Continue on Error: cleanup errors do not prevent others", () => {
      const o = service.createOwner(null);
      const spy1 = vi.fn();
      const spy2 = vi.fn(() => {
        throw new Error("cleanup");
      });
      const spy3 = vi.fn();

      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      service.onScopeCleanup(o, spy1);
      service.onScopeCleanup(o, spy2);
      service.onScopeCleanup(o, spy3);

      expect(() => service.dispose(o)).not.toThrow();

      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy3).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  /*───────────────────────────────────────────────*
   * IV. Disposal Order & Tree Safety
   *───────────────────────────────────────────────*/
  describe("IV. Disposal Order & Tree Safety", () => {
    it("IV1 Post-order traversal: children dispose before parents (via cleanup order)", () => {
      const root = service.createOwner(null);
      const c1 = service.createOwner(root);
      const c2 = service.createOwner(root);
      const g = service.createOwner(c1);

      const order: string[] = [];

      service.onScopeCleanup(g, () => order.push("grandchild"));
      service.onScopeCleanup(c1, () => order.push("child1"));
      service.onScopeCleanup(c2, () => order.push("child2"));
      service.onScopeCleanup(root, () => order.push("root"));

      service.dispose(root);

      expect(order.indexOf("grandchild")).toBeLessThan(order.indexOf("child1"));
      expect(order.indexOf("child1")).toBeLessThan(order.indexOf("root"));
      expect(order.indexOf("child2")).toBeLessThan(order.indexOf("root"));
    });

    it("IV2 Skip already disposed nodes: disposing subtree then root is safe and does not double-run", () => {
      const root = service.createOwner(null);
      const c1 = service.createOwner(root);
      const c2 = service.createOwner(root);

      const spy1 = vi.fn();
      const spy2 = vi.fn();

      service.onScopeCleanup(c1, spy1);
      service.onScopeCleanup(c2, spy2);

      service.dispose(c1);
      service.dispose(root);

      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
    });

    it("IV3 Full structural cleanup: after dispose, node has no links/context/cleanups", () => {
      const root = service.createOwner(null);
      const child = service.createOwner(root);

      service.provide(root, "x", 1);
      service.onScopeCleanup(root, () => {});
      service.onScopeCleanup(child, () => {});

      service.dispose(root);

      // root cleared
      expect(root._parent).toBeNull();
      expect(root._firstChild).toBeNull();
      expect(root._lastChild).toBeNull();
      expect(root._context).toBeNull();
      expect(root._cleanups).toBeNull();
      expect(root._childCount).toBe(0);

      // child cleared
      expect(child._parent).toBeNull();
      expect(child._firstChild).toBeNull();
      expect(child._lastChild).toBeNull();
      expect(child._context).toBeNull();
      expect(child._cleanups).toBeNull();
      expect(child._childCount).toBe(0);
    });
  });

  /*───────────────────────────────────────────────*
   * V. OwnershipState Invariants
   *───────────────────────────────────────────────*/
  describe("V. OwnershipState Invariants", () => {
    it("V1 Mutations after dispose are rejected or ignored safely (no corruption)", () => {
      const root = service.createOwner(null);
      const child = service.createOwner(null);

      service.dispose(root);

      // append on disposed root should not attach
      expect(() => service.appendChild(root, child)).not.toThrow();
      expect(child._parent).toBeNull();

      // cleanup registration on disposed node: should not register / or should throw; choose your policy
      // Current code ignores silently; test for safety (no crash, no reanimation)
      expect(() => service.onScopeCleanup(root, () => {})).not.toThrow();

      // provide on disposed node: policy-dependent. Safety requirement: no throw OR throw, but no corruption.
      expect(() => service.provide(root, "k", 1)).not.toThrow();
      expect(root._parent).toBeNull();
      expect(root._firstChild).toBeNull();
    });

    it("V1 removeChild on disposed parent is safe and does not detach unrelated nodes", () => {
      const p = service.createOwner(null);
      const c = service.createOwner(p);

      service.dispose(p);

      // should not detach child from p because p already disposed (but both are disposed anyway)
      expect(() => service.removeChild(p, c)).not.toThrow();
      expect(c._parent).toBeNull();
    });
  });

  /*───────────────────────────────────────────────*
   * VI. Scope Safety
   *───────────────────────────────────────────────*/
  describe("VI. Scope Safety", () => {
    let scope: OwnershipScope;

    beforeEach(() => {
      scope = createOwnershipScope(service);
    });

    afterEach(() => {
      // no leaks: after each test, scope must be reset
      expect(scope.getOwner()).toBeNull();
    });

    it("VI1 Scope Isolation: withOwner restores even if callback throws", () => {
      const o = service.createOwner(null);

      expect(() => {
        scope.withOwner(o, () => {
          throw new Error("boom");
        });
      }).toThrow("boom");

      expect(scope.getOwner()).toBeNull();
    });

    it("VI2 Nested Scope Restore: inner restores to outer, then to null", () => {
      const outer = service.createOwner(null);
      const inner = service.createOwner(null);

      scope.withOwner(outer, () => {
        expect(scope.getOwner()).toBe(outer);

        scope.withOwner(inner, () => {
          expect(scope.getOwner()).toBe(inner);
        });

        expect(scope.getOwner()).toBe(outer);
      });

      expect(scope.getOwner()).toBeNull();
    });

    it("VI3 createScope Consistency: parent defaults to current owner", () => {
      const parent = service.createOwner(null);
      let created: OwnershipNode | null = null;

      scope.withOwner(parent, () => {
        scope.createScope(() => {
          created = scope.getOwner();
        });
      });

      expect(created).not.toBeNull();
      expect(created!._parent).toBe(parent);
      expect(scope.getOwner()).toBeNull();
    });

    it("createScope works without current owner (creates root owner)", () => {
      let root: OwnershipNode | null = null;

      scope.createScope(() => {
        root = scope.getOwner();
      });

      expect(root).not.toBeNull();
      expect(root!._parent).toBeNull();
      expect(scope.getOwner()).toBeNull();
    });

    it("createScope restores even if callback throws", () => {
      const parent = service.createOwner(null);

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

  /*───────────────────────────────────────────────*
   * VII. Context Safety
   *───────────────────────────────────────────────*/
  describe("VII. Context Safety", () => {
    it("VII1 hasOwn vs inject: hasOwn only for local keys; inject follows chain", () => {
      const p = service.createOwner(null);
      const c = service.createOwner(p);

      service.provide(p, "k", 1);

      expect(service.hasOwn(c, "k")).toBe(false);
      expect(service.inject<number>(c, "k")).toBe(1);

      service.provide(c, "k", 2);
      expect(service.hasOwn(c, "k")).toBe(true);
      expect(service.inject<number>(c, "k")).toBe(2);
      expect(service.inject<number>(p, "k")).toBe(1);
    });

    it("Context chain remains readable after structural mutations", () => {
      const p1 = service.createOwner(null);
      const p2 = service.createOwner(null);
      const c = service.createOwner(p1);

      service.provide(p1, "x", 1);
      expect(service.inject<number>(c, "x")).toBe(1);

      // reparent
      service.appendChild(p2, c);

      // After reparent: c should no longer inherit p1 context
      // This expectation is a *design choice*. If you want inherited context to follow parent after reparent,
      // it should be true; if you freeze context at creation-time, it should remain 1.
      //
      // Current implementation: getContext uses parent._context at creation time only, so behavior depends on when context is initialized.
      // We set a strict security invariant here: reparent should not allow reading old parent chain unintentionally.
      expect(service.inject<number>(c, "x")).toBeUndefined();
    });
  });

  /*───────────────────────────────────────────────*
   * VIII. Error Strategy
   *───────────────────────────────────────────────*/
  describe("VIII. Error Strategy", () => {
    it("dispose is resilient: cleanup errors do not break disposal safety", () => {
      const root = service.createOwner(null);
      const child = service.createOwner(root);

      service.onScopeCleanup(child, () => {
        throw new Error("child cleanup");
      });
      service.onScopeCleanup(root, () => {});

      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      expect(() => service.dispose(root)).not.toThrow();
      consoleError.mockRestore();

      // Safety post-condition: structure cleared
      expect(root._firstChild).toBeNull();
      expect(root._lastChild).toBeNull();
      expect(child._parent).toBeNull();
    });

    it("optional: fuzz mini-run should not corrupt invariants (structural)", () => {
      const root = service.createOwner(null);
      const pool: OwnershipNode[] = [root];

      // small deterministic pseudo-fuzz
      for (let i = 0; i < 200; i++) {
        const r = i % 7;

        if (r === 0) {
          // add child to random parent
          const parent = pool[i % pool.length]!;
          const n = service.createOwner(parent);
          pool.push(n);
        } else if (r === 1 && pool.length > 2) {
          // remove a leaf-ish node if possible
          const n = pool[pool.length - 1]!;
          const p = n._parent;
          if (p !== null) service.removeChild(p, n);
        } else if (r === 2 && pool.length > 2) {
          // reparent last node under root
          const n = pool[pool.length - 1]!;
          if (n !== root) service.appendChild(root, n);
        } else if (r === 3) {
          // context provide/read on random node
          const n = pool[i % pool.length]!;
          service.provide(n, "k", i);
          service.inject<number>(n, "k");
        } else {
          // no-op
        }

        // invariant check only for root chain
        assertSiblingChain(root);
      }

      service.dispose(root);
      expect(root._firstChild).toBeNull();
      expect(root._lastChild).toBeNull();
    });
  });
});
