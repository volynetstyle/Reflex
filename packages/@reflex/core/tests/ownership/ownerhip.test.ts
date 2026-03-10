import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createOwnershipScope,
  OwnershipScope,
} from "../../src/ownership/ownership.scope";
import { OwnershipNode } from "../../src/ownership/ownership.node";

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

    expect(cur._nextSibling).toBe(next);

    if (prev !== null) expect(prev._nextSibling).toBe(cur);
  }

  // count accuracy (white-box but meaningful)
  expect(parent._childCount).toBe(kids.length);
}

function assertDetached(node: OwnershipNode): void {
  expect(node._parent).toBeNull();
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

describe("OwnershipNode — prototype semantics", () => {
  it("methods are stored on prototype (not on instance)", () => {
    const n = new OwnershipNode();

    // instance should NOT have own method properties
    expect(Object.prototype.hasOwnProperty.call(n, "appendChild")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(n, "dispose")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(n, "provide")).toBe(false);

    expect(
      Object.prototype.hasOwnProperty.call(
        OwnershipNode.prototype,
        "appendChild",
      ),
    ).toBe(true);

    expect(
      Object.prototype.hasOwnProperty.call(OwnershipNode.prototype, "dispose"),
    ).toBe(true);

    expect(
      Object.prototype.hasOwnProperty.call(OwnershipNode.prototype, "provide"),
    ).toBe(true);

    // referential equality: instance method resolves to prototype function
    expect(n.appendChild).toBe(OwnershipNode.prototype.appendChild);
    expect(n.dispose).toBe(OwnershipNode.prototype.dispose);
  });

  it("layout fields are own properties", () => {
    const n = new OwnershipNode();

    // MUST be own props
    expect(Object.hasOwn(n, "_parent")).toBe(true);
    expect(Object.hasOwn(n, "_firstChild")).toBe(true);
    expect(Object.hasOwn(n, "_lastChild")).toBe(true);
    expect(Object.hasOwn(n, "_nextSibling")).toBe(true);
    expect(Object.hasOwn(n, "_prevSibling")).toBe(true);
    expect(Object.hasOwn(n, "_childCount")).toBe(true);
    expect(Object.hasOwn(n, "_flags")).toBe(true);

    // verify defaults
    expect(n._parent).toBe(null);
    expect(n._firstChild).toBe(null);
    expect(n._childCount).toBe(0);
  });

  it("onCleanup lazily allocates cleanup list", () => {
    const n = new OwnershipNode();

    expect(n._cleanups).toBe(null);

    const fn = () => {};
    n.onCleanup(fn);

    expect(Array.isArray(n._cleanups)).toBe(true);
    expect(n._cleanups!.length).toBe(1);
    expect(n._cleanups![0]).toBe(fn);
  });

  it("context is lazy", () => {
    const n = new OwnershipNode();

    expect(n._context).toBe(null);

    const ctx = n.getContext();

    expect(ctx).toBe(n._context);
    expect(n._context).not.toBe(null);
  });

  it("appendChild maintains sibling links and counters", () => {
    const p = new OwnershipNode();
    const a = new OwnershipNode();
    const b = new OwnershipNode();

    p.appendChild(a);
    p.appendChild(b);

    expect(p._childCount).toBe(2);
    expect(p._firstChild).toBe(a);
    expect(p._lastChild).toBe(b);

    expect(a._parent).toBe(p);
    expect(b._parent).toBe(p);

    expect(a._nextSibling).toBe(b);
    expect(b._prevSibling).toBe(a);
  });

  it("removeFromParent detaches in O(1) and fixes links", () => {
    const p = new OwnershipNode();
    const a = new OwnershipNode();
    const b = new OwnershipNode();
    const c = new OwnershipNode();

    p.appendChild(a);
    p.appendChild(b);
    p.appendChild(c);

    b.removeFromParent();

    expect(p._childCount).toBe(2);
    expect(p._firstChild).toBe(a);
    expect(p._lastChild).toBe(c);

    expect(a._nextSibling).toBe(c);
    expect(c._prevSibling).toBe(a);

    expect(b._parent).toBe(null);
    expect(b._nextSibling).toBe(null);
    expect(b._prevSibling).toBe(null);
  });

  it("instance does not allocate methods as own keys", () => {
    const n = new OwnershipNode();
    const keys = Object.keys(n);

    expect(keys).toContain("_parent");
    expect(keys).toContain("_firstChild");

    expect(keys).not.toContain("appendChild");
    expect(keys).not.toContain("dispose");
  });
});

describe("Ownership Safety Spec (I–VIII)", () => {
  beforeEach(() => {});

  function createOwner(parent: OwnershipNode | null): OwnershipNode {
    if (parent === null) {
      return OwnershipNode.createRoot();
    }
    return parent.createChild();
  }

  /*───────────────────────────────────────────────*
   * I. Structural Invariants
   *───────────────────────────────────────────────*/
  describe("I. Structural Invariants", () => {
    it("I1 Single Parent: child cannot have two parents after reparent", () => {
      const p1 = createOwner(null);
      const p2 = createOwner(null);
      const c = createOwner(null);

      p1.appendChild(c);
      p2.appendChild(c);

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
      const p = createOwner(null);
      const a = createOwner(null);
      const b = createOwner(null);
      const c = createOwner(null);

      p.appendChild(a);
      p.appendChild(b);
      p.appendChild(c);

      assertSiblingChain(p);
      expect(collectChildren(p)).toEqual([a, b, c]);
    });

    it("I3 Child Count Accuracy: _childCount matches traversal", () => {
      const p = createOwner(null);
      for (let i = 0; i < 50; i++) p.createChild();

      assertSiblingChain(p);

      // remove some
      const kids = collectChildren(p);
      for (let i = 0; i < kids.length; i += 3) {
        kids[i]!.removeFromParent();
      }

      assertSiblingChain(p);
    });

    it("I4 Safe Reparenting: reparent preserves integrity of both lists", () => {
      const p1 = createOwner(null);
      const p2 = createOwner(null);

      const kids: OwnershipNode[] = [];
      for (let i = 0; i < 10; i++) kids.push(p1.createChild());

      // move middle one
      const mid = kids[5]!;
      p2.appendChild(mid);

      assertSiblingChain(p1);
      assertSiblingChain(p2);

      expect(collectChildren(p2)).toEqual([mid]);
      expect(collectChildren(p1)).not.toContain(mid);
    });

    it("I5 Orphan Removal: removeChild detaches child refs", () => {
      const p = createOwner(null);
      const c = p.createChild();

      c.removeFromParent();

      assertDetached(c);
      assertSiblingChain(p);
    });

    it("Removal is safe when child is not owned by parent (no throw, no mutation)", () => {
      const p = createOwner(null);
      const other = createOwner(null);
      const c = other.createChild();

      // should not throw and should not detach from real parent
      expect(() => p.appendChild(c)).not.toThrow();
      expect(c._parent).toBe(p);

      assertSiblingChain(p);
      assertSiblingChain(other);
    });
  });

  /*───────────────────────────────────────────────*
   * II. Context Invariants
   *───────────────────────────────────────────────*/
  describe("II. Context Invariants", () => {
    it("II1 Lazy Context Initialization: _context stays null until first access/provide", () => {
      const o = createOwner(null);
      expect(o._context).toBeNull();

      // getContext should initialize
      const ctx = o.getContext();
      expect(ctx).toBeDefined();
      expect(o._context).not.toBeNull();
      expect(o.getContext()).toBe(ctx);
    });

    it("II2 Inheritance Without Mutation: child can read parent, overrides are isolated", () => {
      const parent = createOwner(null);
      parent.provide("shared", 1);

      const c1 = parent.createChild();
      const c2 = parent.createChild();

      expect(c1.inject<number>("shared")).toBe(1);
      expect(c2.inject<number>("shared")).toBe(1);

      c1.provide("shared", 10);
      c2.provide("shared", 20);

      expect(parent.inject<number>("shared")).toBe(1);
      expect(c1.inject<number>("shared")).toBe(10);
      expect(c2.inject<number>("shared")).toBe(20);
    });

    it("II3 Forbidden Prototype Keys: providing __proto__/constructor/prototype must be rejected", () => {
      const o = createOwner(null);

      // These tests are intentionally strict. If they fail now, it's a real vulnerability to fix.
      for (const key of PROTO_KEYS) {
        expect(() =>
          o.provide(key as unknown as any, { hacked: true }),
        ).toThrow();
      }
    });

    it("II4 Self Reference Prevention: cannot provide owner itself as a value", () => {
      const o = createOwner(null);

      // Strict: if current code does not throw yet, you should add the guard in contextProvide/provide
      expect(() => o.provide("self", o)).toThrow();
    });

    it("hasOwn vs inject: distinguishes own vs inherited keys", () => {
      const parent = createOwner(null);
      parent.provide("inherited", 1);

      const child = parent.createChild();
      child.provide("own", 2);

      expect(child.hasOwnContextKey("own")).toBe(true);
      expect(child.hasOwnContextKey("inherited")).toBe(false);

      expect(child.inject<number>("inherited")).toBe(1);
      expect(child.inject<number>("own")).toBe(2);
    });

    it("supports symbol keys (context keys)", () => {
      const o = createOwner(null);
      const k = Symbol("k") as unknown as any;

      o.provide(k, 123);
      expect(o.inject<number>(k)).toBe(123);
      expect(o.hasOwnContextKey(k)).toBe(true);
    });

    it("returns undefined for missing keys", () => {
      const o = createOwner(null);
      expect(o.inject("missing")).toBeUndefined();
      expect(o.hasOwnContextKey("missing")).toBe(false);
    });

    it("allows null/undefined values without breaking own-ness", () => {
      const o = createOwner(null);
      o.provide("null", null);
      o.provide("undef", undefined);

      expect(o.inject("null")).toBeNull();
      expect(o.inject("undef")).toBeUndefined();
      expect(o.hasOwnContextKey("null")).toBe(true);
      expect(o.hasOwnContextKey("undef")).toBe(true);
    });
  });

  /*───────────────────────────────────────────────*
   * III. Cleanup Invariants
   *───────────────────────────────────────────────*/
  describe("III. Cleanup Invariants", () => {
    it("III1 Lazy Cleanups: _cleanups is null until first registration", () => {
      const o = createOwner(null);
      expect(o._cleanups).toBeNull();

      o.onCleanup(() => {});
      expect(o._cleanups).not.toBeNull();
      expect(Array.isArray(o._cleanups)).toBe(true);
    });

    it("III2 Order Guarantee (LIFO): cleanups run in reverse registration order", () => {
      const o = createOwner(null);
      const order: number[] = [];

      o.onCleanup(() => order.push(1));
      o.onCleanup(() => order.push(2));
      o.onCleanup(() => order.push(3));

      o.dispose();
      expect(order).toEqual([3, 2, 1]);
    });

    it("III3 Idempotent Dispose: cleanups execute exactly once", () => {
      const o = createOwner(null);
      const spy = vi.fn();

      o.onCleanup(spy);
      o.dispose();
      o.dispose();
      o.dispose();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("III4 Continue on Error: cleanup errors do not prevent others", () => {
      const o = createOwner(null);
      const spy1 = vi.fn();
      const spy2 = vi.fn(() => {
        throw new Error("cleanup");
      });
      const spy3 = vi.fn();

      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      o.onCleanup(spy1);
      o.onCleanup(spy2);
      o.onCleanup(spy3);

      expect(() => o.dispose()).not.toThrow();

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
      const root = createOwner(null);
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

    it("IV2 Skip already disposed nodes: disposing subtree then root is safe and does not double-run", () => {
      const root = createOwner(null);
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

    it("IV3 Full structural cleanup: after dispose, node has no links/context/cleanups", () => {
      const root = createOwner(null);
      const child = root.createChild();

      root.provide("x", 1);
      root.onCleanup(() => {});
      child.onCleanup(() => {});

      root.dispose();

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
      const root = createOwner(null);
      const child = createOwner(null);

      root.dispose();

      // append on disposed root should not attach
      expect(() => root.appendChild(child)).not.toThrow();
      expect(child._parent).toBeNull();

      // cleanup registration on disposed node: should not register / or should throw; choose your policy
      // Current code ignores silently; test for safety (no crash, no reanimation)
      expect(() => root.onCleanup(() => {})).not.toThrow();

      // provide on disposed node: policy-dependent. Safety requirement: no throw OR throw, but no corruption.
      expect(() => root.provide("k", 1)).not.toThrow();
      expect(root._parent).toBeNull();
      expect(root._firstChild).toBeNull();
    });

    it("V1 removeChild on disposed parent is safe and does not detach unrelated nodes", () => {
      const p = createOwner(null);
      const c = p.createChild();

      p.dispose();

      // should not detach child from p because p already disposed (but both are disposed anyway)
      expect(() => c.removeFromParent()).not.toThrow();
      expect(c._parent).toBeNull();
    });
  });

  /*───────────────────────────────────────────────*
   * VI. Scope Safety
   *───────────────────────────────────────────────*/
  describe("VI. Scope Safety", () => {
    let scope: OwnershipScope;

    beforeEach(() => {
      scope = createOwnershipScope();
    });

    afterEach(() => {
      // no leaks: after each test, scope must be reset
      expect(scope.getOwner()).toBeNull();
    });

    it("VI1 Scope Isolation: withOwner restores even if callback throws", () => {
      const o = createOwner(null);

      expect(() => {
        scope.withOwner(o, () => {
          throw new Error("boom");
        });
      }).toThrow("boom");

      expect(scope.getOwner()).toBeNull();
    });

    it("VI2 Nested Scope Restore: inner restores to outer, then to null", () => {
      const outer = createOwner(null);
      const inner = createOwner(null);

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
      const parent = createOwner(null);
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
      const parent = createOwner(null);

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
      const p = createOwner(null);
      const c = p.createChild();

      p.provide("k", 1);

      expect(c.hasOwnContextKey("k")).toBe(false);
      expect(c.inject<number>("k")).toBe(1);

      c.provide("k", 2);
      expect(c.hasOwnContextKey("k")).toBe(true);
      expect(c.inject<number>("k")).toBe(2);
      expect(p.inject<number>("k")).toBe(1);
    });

    it("Context chain remains readable after structural mutations", () => {
      const p1 = createOwner(null);
      const p2 = createOwner(null);
      const c = p1.createChild();

      p1.provide("x", 1);
      expect(c.inject<number>("x")).toBe(1);

      // reparent
      p2.appendChild(c);

      // After reparent: c should no longer inherit p1 context
      // This expectation is a *design choice*. If you want inherited context to follow parent after reparent,
      // it should be true; if you freeze context at creation-time, it should remain 1.
      //
      // Current implementation: getContext uses parent._context at creation time only, so behavior depends on when context is initialized.
      // We set a strict security invariant here: reparent should not allow reading old parent chain unintentionally.
      expect(c.inject<number>("x")).toBeUndefined();
    });
  });

  /*───────────────────────────────────────────────*
   * VIII. Error Strategy
   *───────────────────────────────────────────────*/
  describe("VIII. Error Strategy", () => {
    it("dispose is resilient: cleanup errors do not break disposal safety", () => {
      const root = createOwner(null);
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

      // Safety post-condition: structure cleared
      expect(root._firstChild).toBeNull();
      expect(root._lastChild).toBeNull();
      expect(child._parent).toBeNull();
    });

    it("optional: fuzz mini-run should not corrupt invariants (structural)", () => {
      const root = createOwner(null);
      const pool: OwnershipNode[] = [root];

      // small deterministic pseudo-fuzz
      for (let i = 0; i < 200; i++) {
        const r = i % 7;

        if (r === 0) {
          // add child to random parent
          const parent = pool[i % pool.length]!;
          const n = parent.createChild();
          pool.push(n);
        } else if (r === 1 && pool.length > 2) {
          // remove a leaf-ish node if possible
          const n = pool[pool.length - 1]!;
          if (n._parent !== null) n.removeFromParent();
        } else if (r === 2 && pool.length > 2) {
          // reparent last node under root
          const n = pool[pool.length - 1]!;
          if (n !== root) root.appendChild(n);
        } else if (r === 3) {
          // context provide/read on random node
          const n = pool[i % pool.length]!;
          n.provide("k", i);
          n.inject<number>("k");
        } else {
          // no-op
        }

        // invariant check only for root chain
        assertSiblingChain(root);
      }

      root.dispose();
      expect(root._firstChild).toBeNull();
      expect(root._lastChild).toBeNull();
    });
  });
});
