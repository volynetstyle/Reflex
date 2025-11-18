import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createOwner } from "../../src/core/ownership/ownership.core";
import { createOwnershipScope } from "../../src/core/ownership/ownership.scope";
import {
  CLEAN,
  DISPOSED,
  DISPOSING,
} from "../../src/core/ownership/ownership.type";

const isClean = (o: any) => o._flags === CLEAN;
const isDisposed = (o: any) => o._flags === DISPOSED;
const isDisposing = (o: any) => (o._flags & DISPOSING) === DISPOSING;

const collectChildren = (owner: any) => {
  const arr: any[] = [];
  let child = owner._firstChild;
  while (child !== null) {
    arr.push(child);
    child = child._nextSibling;
  }
  return arr;
};

describe("OwnershipPrototype — Core Behavior", () => {
  describe("appendChild/removeChild", () => {
    it("should attach child and establish parent relationship", () => {
      const parent = createOwner();
      const child = createOwner();

      parent.appendChild(child);

      expect(child._parent).toBe(parent);
      expect(parent._firstChild).toBe(child);
      expect(parent._lastChild).toBe(child);
      expect(parent._childCount).toBe(1);
    });

    it("should link multiple children in order", () => {
      const parent = createOwner();
      const child1 = createOwner();
      const child2 = createOwner();
      const child3 = createOwner();

      parent.appendChild(child1);
      parent.appendChild(child2);
      parent.appendChild(child3);

      expect(parent._firstChild).toBe(child1);
      expect(parent._lastChild).toBe(child3);
      expect(child1._nextSibling).toBe(child2);
      expect(child2._prevSibling).toBe(child1);
      expect(child2._nextSibling).toBe(child3);
      expect(child3._prevSibling).toBe(child2);
      expect(parent._childCount).toBe(3);
    });

    it("should safely remove non-existent child", () => {
      const p = createOwner();
      const c = createOwner();
      expect(() => p.removeChild(c)).not.toThrow();
      expect(p._firstChild).toBeNull();
    });

    it("should detach child reference after removal", () => {
      const p = createOwner();
      const c = createOwner();

      p.appendChild(c);
      p.removeChild(c);

      expect(c._parent).toBeNull();
      expect(c._nextSibling).toBeNull();
      expect(c._prevSibling).toBeNull();
      expect(p._firstChild).toBeNull();
      expect(p._lastChild).toBeNull();
      expect(p._childCount).toBe(0);
    });

    it("should remove child from middle of sibling chain", () => {
      const p = createOwner();
      const c1 = createOwner();
      const c2 = createOwner();
      const c3 = createOwner();

      p.appendChild(c1);
      p.appendChild(c2);
      p.appendChild(c3);

      p.removeChild(c2);

      expect(c1._nextSibling).toBe(c3);
      expect(c3._prevSibling).toBe(c1);
      expect(p._firstChild).toBe(c1);
      expect(p._lastChild).toBe(c3);
      expect(p._childCount).toBe(2);
    });

    it("should remove first child correctly", () => {
      const p = createOwner();
      const c1 = createOwner();
      const c2 = createOwner();

      p.appendChild(c1);
      p.appendChild(c2);
      p.removeChild(c1);

      expect(p._firstChild).toBe(c2);
      expect(c2._prevSibling).toBeNull();
      expect(p._childCount).toBe(1);
    });

    it("should remove last child correctly", () => {
      const p = createOwner();
      const c1 = createOwner();
      const c2 = createOwner();

      p.appendChild(c1);
      p.appendChild(c2);
      p.removeChild(c2);

      expect(p._lastChild).toBe(c1);
      expect(c1._nextSibling).toBeNull();
      expect(p._childCount).toBe(1);
    });
  });

  describe("Context Management", () => {
    it("should inherit context from parent on appendChild", () => {
      const parent = createOwner();
      parent.provide("key", 100);

      const child = createOwner();
      parent.appendChild(child);

      expect(child.inject("key")).toBe(100);
    });

    it("should create isolated context copies for each child", () => {
      const parent = createOwner();
      parent.provide("shared", 1);

      const child1 = createOwner(parent);
      const child2 = createOwner(parent);

      child1.provide("shared", 10);
      child2.provide("shared", 20);

      expect(parent.inject("shared")).toBe(1);
      expect(child1.inject("shared")).toBe(10);
      expect(child2.inject("shared")).toBe(20);
    });

    it("should lazily initialize context on first getContext call", () => {
      const owner = createOwner();

      expect(owner._context).toBeNull();
      const ctx = owner.getContext();
      expect(owner._context).toBeDefined();
      expect(ctx).toBe(owner._context);
    });

    it("should inherit parent context lazily", () => {
      const parent = createOwner();
      parent.provide("x", 5);

      const child = createOwner(parent);
      expect(child._context).toBeNull();

      const value = child.inject("x");
      expect(value).toBe(5);
      expect(child._context).toBeDefined();
    });

    it("should prevent providing owner itself in context", () => {
      const owner = createOwner();
      expect(() => owner.provide("self", owner)).toThrow(
        "Cannot provide owner itself",
      );
    });

    it("should support symbol keys in context", () => {
      const owner = createOwner();
      const key = Symbol("test");

      owner.provide(key as any, "symbol-value");
      expect(owner.inject(key as any)).toBe("symbol-value");
      expect(owner.hasOwn(key as any)).toBe(true);
    });

    it("should return undefined for non-existent keys", () => {
      const owner = createOwner();
      expect(owner.inject("missing")).toBeUndefined();
      expect(owner.hasOwn("missing")).toBe(false);
    });

    it("should distinguish between own and inherited keys", () => {
      const parent = createOwner();
      parent.provide("inherited", 1);

      const child = createOwner(parent);
      child.provide("own", 2);

      expect(child.hasOwn("own")).toBe(true);
      expect(child.hasOwn("inherited")).toBe(false);
      expect(child.inject("inherited")).toBe(1);
    });
  });

  describe("Cleanup Registration", () => {
    it("should register and execute cleanup callbacks", () => {
      const owner = createOwner();
      const spy = vi.fn();

      owner.onScopeCleanup(spy);
      (owner as any).dispose();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("should execute multiple cleanup callbacks in LIFO order", () => {
      const owner = createOwner();
      const order: number[] = [];

      owner.onScopeCleanup(() => order.push(1));
      owner.onScopeCleanup(() => order.push(2));
      owner.onScopeCleanup(() => order.push(3));

      (owner as any).dispose();

      expect(order).toEqual([3, 2, 1]);
    });

    it("should throw when adding cleanup to disposed owner", () => {
      const owner = createOwner();
      (owner as any).dispose();

      expect(() => owner.onScopeCleanup(() => {})).toThrow();
    });

    it("should initialize disposal array lazily", () => {
      const owner = createOwner();
      expect(owner._cleanups).toBeNull();

      owner.onScopeCleanup(() => {});
      expect(owner._cleanups).toBeDefined();
      expect(Array.isArray(owner._cleanups)).toBe(true);
    });
  });

  describe("Disposal Process", () => {
    it("should dispose tree in DFS post-order", () => {
      const root = createOwner();
      const child1 = createOwner(root);
      const child2 = createOwner(root);
      const grandchild = createOwner(child1);

      const order: string[] = [];

      grandchild.onScopeCleanup(() => order.push("grandchild"));
      child1.onScopeCleanup(() => order.push("child1"));
      child2.onScopeCleanup(() => order.push("child2"));
      root.onScopeCleanup(() => order.push("root"));

      (root as any).dispose();

      expect(order).toEqual(["grandchild", "child1", "child2", "root"]);
    });

    it("should mark all nodes as DISPOSED after cleanup", () => {
      const root = createOwner();
      const child = createOwner(root);

      (root as any).dispose();

      expect(isDisposed(root)).toBe(true);
      expect(isDisposed(child)).toBe(true);
    });

    it("should be idempotent (multiple dispose calls safe)", () => {
      const owner = createOwner();
      const spy = vi.fn();

      owner.onScopeCleanup(spy);
      (owner as any).dispose();
      (owner as any).dispose();
      (owner as any).dispose();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(isDisposed(owner)).toBe(true);
    });

    it("should clear references after disposal", () => {
      const o = createOwner();
      o.provide("x", 1);
      o.onScopeCleanup(() => {});
      const c = createOwner(o);
      (o as any).dispose();
      expect(o._cleanups).toBeNull();
      expect(o._context).toBeNull();
      expect(o._firstChild).toBeNull();
      expect(o._lastChild).toBeNull();
    });

    it("should continue cleanup despite errors in cleanup callbacks", () => {
      const owner = createOwner();
      const spy1 = vi.fn();
      const spy2 = vi.fn(() => {
        throw new Error("cleanup error");
      });
      const spy3 = vi.fn();

      owner.onScopeCleanup(spy1);
      owner.onScopeCleanup(spy2);
      owner.onScopeCleanup(spy3);

      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      (owner as any).dispose();

      expect(spy1).toHaveBeenCalled();
      expect(spy2).toHaveBeenCalled();
      expect(spy3).toHaveBeenCalled();
      expect(isDisposed(owner)).toBe(true);
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("should call onError for each error when strategy provided", () => {
      const owner = createOwner();
      const errors: unknown[] = [];

      owner.onScopeCleanup(() => {
        throw new Error("error1");
      });
      owner.onScopeCleanup(() => {
        throw new Error("error2");
      });

      (owner as any).dispose({
        onError: (err: any) => errors.push(err),
      });

      expect(errors).toHaveLength(2);
      expect(isDisposed(owner)).toBe(true);
    });

    it("should call beforeDispose and afterDispose hooks", () => {
      const owner = createOwner();
      const hooks: string[] = [];

      (owner as any).dispose({
        beforeDispose: () => hooks.push("before"),
        afterDispose: () => hooks.push("after"),
      });

      expect(hooks).toEqual(["before", "after"]);
    });

    it("should pass error count to afterDispose", () => {
      const owner = createOwner();
      let errorCount = -1;

      owner.onScopeCleanup(() => {
        throw new Error("fail");
      });

      (owner as any).dispose({
        afterDispose: (_: any, count: number) => {
          errorCount = count;
        },
        onError: () => {},
      });

      expect(errorCount).toBe(1);
    });

    it("should skip already disposed nodes in tree", () => {
      const root = createOwner();
      const child1 = createOwner(root);
      const child2 = createOwner(root);

      const spy1 = vi.fn();
      const spy2 = vi.fn();

      child1.onScopeCleanup(spy1);
      child2.onScopeCleanup(spy2);

      (child1 as any).dispose();
      (root as any).dispose();

      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
    });
  });

  describe("Edge Cases & Safety", () => {
    it("should handle empty ownership tree", () => {
      const owner = createOwner();
      expect(() => (owner as any).dispose()).not.toThrow();
      expect(isDisposed(owner)).toBe(true);
    });

    it("should handle deeply nested trees", () => {
      let current = createOwner();
      const depth = 100;

      for (let i = 0; i < depth; i++) {
        const child = createOwner(current);
        current = child;
      }

      expect(current._parent).toBeDefined();
      expect(() => (current as any).dispose()).not.toThrow();
    });

    it("should handle wide trees with many children", () => {
      const root = createOwner();
      const childCount = 1000;

      for (let i = 0; i < childCount; i++) {
        createOwner(root);
      }

      expect(root._childCount).toBe(childCount);
      expect(() => (root as any).dispose()).not.toThrow();
      expect(isDisposed(root)).toBe(true);
    });

    it("should handle null/undefined in context values", () => {
      const owner = createOwner();

      owner.provide("null", null);
      owner.provide("undefined", undefined);

      expect(owner.inject("null")).toBe(null);
      expect(owner.inject("undefined")).toBe(undefined);
      expect(owner.hasOwn("null")).toBe(true);
      expect(owner.hasOwn("undefined")).toBe(true);
    });

    it("should maintain state consistency across operations", () => {
      const owner = createOwner();

      expect(isClean(owner)).toBe(true);

      owner.onScopeCleanup(() => {});
      expect(isClean(owner)).toBe(true);

      owner.provide("x", 1);
      expect(isClean(owner)).toBe(true);

      (owner as any).dispose();
      expect(isDisposed(owner)).toBe(true);
    });
  });
});

describe("OwnershipScope — Context Management", () => {
  let scope: ReturnType<typeof createOwnershipScope>;

  beforeEach(() => {
    scope = createOwnershipScope();
  });

  afterEach(() => {
    // Ensure no dangling owners
    expect(scope.getOwner()).toBeNull();
  });

  describe("withOwner", () => {
    it("should set and restore current owner", () => {
      const owner = createOwner();
      let seenOwner: any;

      scope.withOwner(owner, () => {
        seenOwner = scope.getOwner();
      });

      expect(seenOwner).toBe(owner);
      expect(scope.getOwner()).toBeNull();
    });

    it("should return callback result", () => {
      const owner = createOwner();
      const result = scope.withOwner(owner, () => 42);

      expect(result).toBe(42);
    });

    it("should restore owner even if callback throws", () => {
      const owner = createOwner();

      expect(() => {
        scope.withOwner(owner, () => {
          throw new Error("test");
        });
      }).toThrow("test");

      expect(scope.getOwner()).toBeNull();
    });

    it("should handle nested withOwner calls", () => {
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
  });

  describe("createScope", () => {
    it("should create child owner and execute callback", () => {
      const parent = createOwner();
      let childOwner: any;

      scope.withOwner(parent, () => {
        scope.createScope(() => {
          childOwner = scope.getOwner();
        });
      });

      expect(childOwner).toBeDefined();
      expect(childOwner).not.toBe(parent);
      expect(childOwner._parent).toBe(parent);
    });

    it("should restore parent owner after scope", () => {
      const parent = createOwner();

      scope.withOwner(parent, () => {
        scope.createScope(() => {
          expect(scope.getOwner()).not.toBe(parent);
        });

        expect(scope.getOwner()).toBe(parent);
      });
    });

    it("should return callback result", () => {
      const parent = createOwner();

      const result = scope.withOwner(parent, () => {
        return scope.createScope(() => "value");
      });

      expect(result).toBe("value");
    });

    it("should work without parent owner", () => {
      let rootOwner: any;

      scope.createScope(() => {
        rootOwner = scope.getOwner();
      });

      expect(rootOwner).toBeDefined();
      expect(rootOwner._parent).toBeNull();
    });

    it("should create nested scopes correctly", () => {
      const owners: any[] = [];

      scope.createScope(() => {
        owners.push(scope.getOwner());

        scope.createScope(() => {
          owners.push(scope.getOwner());

          scope.createScope(() => {
            owners.push(scope.getOwner());
          });
        });
      });

      expect(owners).toHaveLength(3);
      expect(owners[0]).toBeDefined();
      expect(owners[1]._parent).toBe(owners[0]);
      expect(owners[2]._parent).toBe(owners[1]);
    });

    it("should handle errors and restore scope", () => {
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

  describe("getOwner", () => {
    it("should return null when no owner set", () => {
      expect(scope.getOwner()).toBeNull();
    });

    it("should return current owner", () => {
      const owner = createOwner();

      scope.withOwner(owner, () => {
        expect(scope.getOwner()).toBe(owner);
      });
    });
  });
});
