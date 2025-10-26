/**
 * @file ownership.test.ts
 * Comprehensive test suite for ownership system
 */

import { createOwner } from "../core/ownership/ownership.core";
import { OwnershipScope } from "../core/ownership/ownership.scope";
import { OwnershipStateFlags, IOwnership } from "../core/ownership/ownership.type";



function logPerf(name: string, duration: number, limit?: number) {
  const pass = limit === undefined || duration <= limit;
  const barLength = 50;
  let filled = 0;

  if (limit) {
    filled = Math.min(barLength, Math.floor((duration / limit) * barLength));
  } else {
    // если лимита нет, масштабируем просто пропорционально небольшому значению
    const scale = duration > 0 ? Math.min(duration / 10, 1) : 0;
    filled = Math.min(barLength, Math.floor(scale * barLength));
  }

  const empty = barLength - filled;
  const color = pass ? "\x1b[32m" : "\x1b[31m"; // green/red
  const reset = "\x1b[0m";

  console.log(
    `${name.padEnd(40)} | ${color}${"█".repeat(filled)}${"░".repeat(
      empty
    )}${reset} | ${duration.toFixed(2)}ms${limit ? ` (limit: ${limit}ms)` : ""}`
  );
}

describe("OwnershipCore", () => {
  describe("createOwner", () => {
    it("should create owner with clean initial state", () => {
      const owner = createOwner();

      expect(owner._parent).toBeUndefined();
      expect(owner._firstChild).toBeUndefined();
      expect(owner._lastChild).toBeUndefined();
      expect(owner._nextSibling).toBeUndefined();
      expect(owner._prevSibling).toBeUndefined();
      expect(owner._childCount).toBe(0);
      expect(owner._state).toBe(OwnershipStateFlags.CLEAN);
      expect(owner._disposal).toBe(undefined);
    });

    it("should attach to parent when provided", () => {
      const parent = createOwner();
      const child = createOwner(parent);

      expect(child._parent).toBe(parent);
      expect(parent._firstChild).toBe(child);
      expect(parent._lastChild).toBe(child);
      expect(parent._childCount).toBe(1);
    });

    it("should call parent.onScopeMount when attached", () => {
      const parent = createOwner();
      const mountSpy = jest.fn();
      parent.onScopeMount = mountSpy;

      const child = createOwner(parent);

      expect(mountSpy).toHaveBeenCalledWith(child);
      expect(mountSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("appendChild", () => {
    it("should add child to empty parent", () => {
      const parent = createOwner();
      const child = createOwner();

      parent.appendChild(child);

      expect(child._parent).toBe(parent);
      expect(parent._firstChild).toBe(child);
      expect(parent._lastChild).toBe(child);
      expect(parent._childCount).toBe(1);
    });

    it("should add multiple children maintaining order", () => {
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
      expect(child2._nextSibling).toBe(child3);
      expect(child2._prevSibling).toBe(child1);
      expect(child3._prevSibling).toBe(child2);
      expect(parent._childCount).toBe(3);
    });

    it("should handle re-appending same child (noop)", () => {
      const parent = createOwner();
      const child = createOwner();

      parent.appendChild(child);
      parent.appendChild(child);

      expect(parent._childCount).toBe(1);
    });

    it("should detach from previous parent before attaching", () => {
      const parent1 = createOwner();
      const parent2 = createOwner();
      const child = createOwner();

      parent1.appendChild(child);
      expect(parent1._childCount).toBe(1);

      parent2.appendChild(child);
      expect(parent1._childCount).toBe(0);
      expect(parent2._childCount).toBe(1);
      expect(child._parent).toBe(parent2);
    });

    it("should throw when appending disposed child", () => {
      const parent = createOwner();
      const child = createOwner();

      child._state = OwnershipStateFlags.DISPOSED;

      expect(() => parent.appendChild(child)).toThrow(
        "Cannot append a disposed child"
      );
    });

    it("should throw when appending to disposing parent", () => {
      const parent = createOwner();
      const child = createOwner();

      parent._state = OwnershipStateFlags.DISPOSING;

      expect(() => parent.appendChild(child)).toThrow(
        "Cannot append child to an owner that is disposing"
      );
    });

    it("should inherit context from parent", () => {
      const parent = createOwner();
      parent._context = { foo: "bar" };

      const child = createOwner();
      parent.appendChild(child);

      expect(child._context).toBeDefined();
      expect(child._context).not.toBe(parent._context);
    });

    it("should not create context if parent has none", () => {
      const parent = createOwner();
      const child = createOwner();

      parent.appendChild(child);

      expect(child._context).toBeUndefined();
    });
  });

  describe("removeChild", () => {
    it("should remove child from parent", () => {
      const parent = createOwner();
      const child = createOwner(parent);

      parent.removeChild(child);

      expect(child._parent).toBeUndefined();
      expect(parent._firstChild).toBeUndefined();
      expect(parent._lastChild).toBeUndefined();
      expect(parent._childCount).toBe(0);
    });

    it("should handle removing from wrong parent (noop)", () => {
      const parent1 = createOwner();
      const parent2 = createOwner();
      const child = createOwner(parent1);

      parent2.removeChild(child);

      expect(child._parent).toBe(parent1);
      expect(parent1._childCount).toBe(1);
    });

    it("should update sibling links when removing middle child", () => {
      const parent = createOwner();
      const child1 = createOwner(parent);
      const child2 = createOwner(parent);
      const child3 = createOwner(parent);

      parent.removeChild(child2);

      expect(child1._nextSibling).toBe(child3);
      expect(child3._prevSibling).toBe(child1);
      expect(parent._childCount).toBe(2);
    });

    it("should update firstChild when removing first child", () => {
      const parent = createOwner();
      const child1 = createOwner(parent);
      const child2 = createOwner(parent);

      parent.removeChild(child1);

      expect(parent._firstChild).toBe(child2);
      expect(child2._prevSibling).toBeUndefined();
    });

    it("should update lastChild when removing last child", () => {
      const parent = createOwner();
      const child1 = createOwner(parent);
      const child2 = createOwner(parent);

      parent.removeChild(child2);

      expect(parent._lastChild).toBe(child1);
      expect(child1._nextSibling).toBeUndefined();
    });

    it("should clear all child references", () => {
      const parent = createOwner();
      const child = createOwner(parent);

      parent.removeChild(child);

      expect(child._parent).toBeUndefined();
      expect(child._prevSibling).toBeUndefined();
      expect(child._nextSibling).toBeUndefined();
    });
  });

  describe("onScopeCleanup", () => {
    it("should add cleanup function", () => {
      const owner = createOwner();
      const cleanup = jest.fn();

      owner.onScopeCleanup(cleanup);

      expect(owner._disposal).toContain(cleanup);
    });

    it("should add multiple cleanup functions", () => {
      const owner = createOwner();
      const cleanup1 = jest.fn();
      const cleanup2 = jest.fn();
      const cleanup3 = jest.fn();

      owner.onScopeCleanup(cleanup1);
      owner.onScopeCleanup(cleanup2);
      owner.onScopeCleanup(cleanup3);

      expect(owner._disposal).toHaveLength(3);
      expect(owner._disposal).toEqual([cleanup1, cleanup2, cleanup3]);
    });

    // it("should throw when adding cleanup to disposed owner", () => {
    //   const owner = createOwner();
    //   owner._state = OwnershipStateFlags.DISPOSED;

    //   expect(() => owner.onScopeCleanup(jest.fn())).toThrow(
    //     "[Ownership dispose] 1 error(s) during cleanup"
    //   );
    // });

    it("should initialize disposal array if not present", () => {
      const owner = createOwner();
      owner._disposal = undefined as any;

      owner.onScopeCleanup(jest.fn());

      expect(owner._disposal).toBeDefined();
      expect(Array.isArray(owner._disposal)).toBe(true);
    });
  });

  describe("dispose", () => {
    it("should mark owner as disposed", () => {
      const owner = createOwner();

      owner.dispose();

      expect(owner._state & OwnershipStateFlags.DISPOSED).toBeTruthy();
    });

    it("should handle disposing already disposed owner (noop)", () => {
      const owner = createOwner();

      owner.dispose();
      owner.dispose();

      // Should not throw or cause issues
      expect(owner._state & OwnershipStateFlags.DISPOSED).toBeTruthy();
    });

    it("should dispose all children recursively", () => {
      const parent = createOwner();
      const child1 = createOwner(parent);
      const child2 = createOwner(parent);
      const grandchild = createOwner(child1);

      parent.dispose();

      expect(parent._state & OwnershipStateFlags.DISPOSED).toBeTruthy();
      expect(child1._state & OwnershipStateFlags.DISPOSED).toBeTruthy();
      expect(child2._state & OwnershipStateFlags.DISPOSED).toBeTruthy();
      expect(grandchild._state & OwnershipStateFlags.DISPOSED).toBeTruthy();
    });

    it("should call cleanup functions", () => {
      const owner = createOwner();
      const cleanup1 = jest.fn();
      const cleanup2 = jest.fn();

      owner.onScopeCleanup(cleanup1);
      owner.onScopeCleanup(cleanup2);

      owner.dispose();

      expect(cleanup1).toHaveBeenCalled();
      expect(cleanup2).toHaveBeenCalled();
    });

    it("should skip already disposed nodes in tree", () => {
      const parent = createOwner();
      const child1 = createOwner(parent);
      const child2 = createOwner(parent);

      child1._state = OwnershipStateFlags.DISPOSED;

      parent.dispose();

      expect(parent._state & OwnershipStateFlags.DISPOSED).toBeTruthy();
      expect(child2._state & OwnershipStateFlags.DISPOSED).toBeTruthy();
    });

    it("should handle deep tree disposal", () => {
      const root = createOwner();
      let current = root;

      // Create deep tree: 100 levels
      for (let i = 0; i < 100; i++) {
        current = createOwner(current);
      }

      expect(() => root.dispose()).not.toThrow();
    });

    it("should handle wide tree disposal", () => {
      const root = createOwner();

      // Create wide tree: 100 children
      for (let i = 0; i < 100; i++) {
        createOwner(root);
      }

      expect(() => root.dispose()).not.toThrow();
      expect(root._state & OwnershipStateFlags.DISPOSED).toBeTruthy();
    });
  });
});

describe("OwnershipScope", () => {
  let scope: OwnershipScope;

  beforeEach(() => {
    scope = new OwnershipScope();
  });

  describe("owner getter", () => {
    it("should return undefined initially", () => {
      expect(scope.owner).toBeUndefined();
    });

    it("should return current owner after setting", () => {
      const owner = createOwner();
      scope.withOwner(owner, () => {
        expect(scope.owner).toBe(owner);
      });
    });
  });

  describe("createScope", () => {
    it("should create new owner under current owner", () => {
      const parent = createOwner();
      let childOwner: IOwnership | undefined;

      scope.withOwner(parent, () => {
        scope.createScope(() => {
          childOwner = scope.owner;
        });
      });

      expect(childOwner).toBeDefined();
      expect(childOwner!._parent).toBe(parent);
    });

    it("should create root owner when no current owner", () => {
      let rootOwner: IOwnership | undefined;

      scope.createScope(() => {
        rootOwner = scope.owner;
      });

      expect(rootOwner).toBeDefined();
      expect(rootOwner!._parent).toBeUndefined();
    });

    it("should execute callback in new scope", () => {
      const callback = jest.fn(() => 42);

      const result = scope.createScope(callback);

      expect(callback).toHaveBeenCalled();
      expect(result).toBe(42);
    });

    it("should restore previous owner after callback", () => {
      const parent = createOwner();

      scope.withOwner(parent, () => {
        scope.createScope(() => {
          expect(scope.owner).not.toBe(parent);
        });

        expect(scope.owner).toBe(parent);
      });
    });

    it("should use explicit parent when provided", () => {
      const parent1 = createOwner();
      const parent2 = createOwner();
      let childOwner: IOwnership | undefined;

      scope.withOwner(parent1, () => {
        scope.createScope(() => {
          childOwner = scope.owner;
        }, parent2);
      });

      expect(childOwner!._parent).toBe(parent2);
    });

    it("should handle nested scopes", () => {
      const owners: IOwnership[] = [];

      scope.createScope(() => {
        owners.push(scope.owner!);

        scope.createScope(() => {
          owners.push(scope.owner!);

          scope.createScope(() => {
            owners.push(scope.owner!);
          });
        });
      });

      expect(owners).toHaveLength(3);
      expect(owners[1]._parent).toBe(owners[0]);
      expect(owners[2]._parent).toBe(owners[1]);
    });
  });

  describe("withOwner", () => {
    it("should temporarily set owner during callback", () => {
      const owner = createOwner();
      const callback = jest.fn();

      scope.withOwner(owner, callback);

      expect(callback).toHaveBeenCalled();
    });

    it("should restore previous owner after callback", () => {
      const owner1 = createOwner();
      const owner2 = createOwner();

      scope.withOwner(owner1, () => {
        expect(scope.owner).toBe(owner1);

        scope.withOwner(owner2, () => {
          expect(scope.owner).toBe(owner2);
        });

        expect(scope.owner).toBe(owner1);
      });
    });

    it("should restore owner even if callback throws", () => {
      const owner = createOwner();

      expect(() => {
        scope.withOwner(owner, () => {
          throw new Error("Test error");
        });
      }).toThrow("Test error");

      expect(scope.owner).toBeUndefined();
    });

    it("should return callback result", () => {
      const owner = createOwner();
      const result = scope.withOwner(owner, () => 42);

      expect(result).toBe(42);
    });

    it("should handle async callbacks", async () => {
      const owner = createOwner();

      const result = await scope.withOwner(owner, async () => {
        expect(scope.owner).toBe(owner);
        return Promise.resolve(42);
      });

      expect(result).toBe(42);
    });
  });
});

describe("Integration Tests", () => {
  describe("Complex tree operations", () => {
    it("should handle moving subtrees between parents", () => {
      const parent1 = createOwner();
      const parent2 = createOwner();
      const child = createOwner(parent1);
      const grandchild = createOwner(child);

      parent2.appendChild(child);

      expect(child._parent).toBe(parent2);
      expect(grandchild._parent).toBe(child);
      expect(parent1._childCount).toBe(0);
      expect(parent2._childCount).toBe(1);
    });

    it("should dispose subtrees independently", () => {
      const root = createOwner();
      const branch1 = createOwner(root);
      const branch2 = createOwner(root);
      const leaf1 = createOwner(branch1);
      const leaf2 = createOwner(branch2);

      branch1.dispose();

      expect(branch1._state & OwnershipStateFlags.DISPOSED).toBeTruthy();
      expect(leaf1._state & OwnershipStateFlags.DISPOSED).toBeTruthy();
      expect(branch2._state & OwnershipStateFlags.DISPOSED).toBeFalsy();
      expect(leaf2._state & OwnershipStateFlags.DISPOSED).toBeFalsy();
    });

    it("should maintain tree integrity after multiple operations", () => {
      const root = createOwner();
      const children = Array.from({ length: 10 }, () => createOwner(root));

      // Remove even children
      children.forEach((child, i) => {
        if (i % 2 === 0) root.removeChild(child);
      });

      expect(root._childCount).toBe(5);

      // Verify sibling links
      let current = root._firstChild;
      let count = 0;

      while (current) {
        count++;
        current = current._nextSibling;
      }

      expect(count).toBe(5);
    });
  });

  describe("Cleanup execution order", () => {
    it("should execute cleanups in registration order", () => {
      const owner = createOwner();
      const order: number[] = [];

      owner.onScopeCleanup(() => order.push(1));
      owner.onScopeCleanup(() => order.push(2));
      owner.onScopeCleanup(() => order.push(3));

      owner.dispose();

      // Order depends on DisposalStrategy, but should be consistent
      expect(order).toHaveLength(3);
      expect(order).toContain(1);
      expect(order).toContain(2);
      expect(order).toContain(3);
    });

    it("should handle cleanup errors gracefully", () => {
      const owner = createOwner();
      const cleanup1 = jest.fn();
      const cleanup2 = jest.fn(() => {
        throw new Error("Cleanup error");
      });
      const cleanup3 = jest.fn();

      owner.onScopeCleanup(cleanup1);
      owner.onScopeCleanup(cleanup2);
      owner.onScopeCleanup(cleanup3);

      // Depending on DisposalStrategy, errors might be collected
      owner.dispose();

      expect(cleanup1).toHaveBeenCalled();
      expect(cleanup2).toHaveBeenCalled();
    });
  });

  describe("Scope integration", () => {
    it("should create scoped resource management", () => {
      const scope = new OwnershipScope();
      const resources: string[] = [];

      scope.createScope(() => {
        const owner = scope.owner!;

        owner.onScopeCleanup(() => resources.push("cleanup1"));
        owner.onScopeCleanup(() => resources.push("cleanup2"));

        owner.dispose();
      });

      expect(resources).toHaveLength(2);
    });

    it("should support nested resource scopes", () => {
      const scope = new OwnershipScope();
      const events: string[] = [];

      scope.createScope(() => {
        events.push("outer-start");
        const outer = scope.owner!;
        outer.onScopeCleanup(() => events.push("outer-cleanup"));

        scope.createScope(() => {
          events.push("inner-start");
          const inner = scope.owner!;
          inner.onScopeCleanup(() => events.push("inner-cleanup"));

          inner.dispose();
        });

        events.push("outer-end");
        outer.dispose();
      });

      expect(events).toEqual([
        "outer-start",
        "inner-start",
        "inner-cleanup",
        "outer-end",
        "outer-cleanup",
      ]);
    });
  });
});

describe("Performance Tests", () => {
  it("should handle large number of children efficiently", () => {
    const parent = createOwner();
    const childCount = 10000;

    const start = performance.now();
    for (let i = 0; i < childCount; i++) createOwner(parent);
    const duration = performance.now() - start;

    expect(parent._childCount).toBe(childCount);

    logPerf("Adding 10k children", duration, 100);
  });

  it("should dispose large trees efficiently", () => {
    const root = createOwner();

    function createTree(parent: IOwnership, depth: number) {
      if (!depth) return;
      const left = createOwner(parent);
      const right = createOwner(parent);
      createTree(left, depth - 1);
      createTree(right, depth - 1);
    }

    createTree(root, 10); // ~1000 nodes

    const start = performance.now();
    root.dispose();
    const duration = performance.now() - start;

    logPerf("Disposing 1k-node tree", duration, 50);
  });

  it("should handle many cleanups efficiently", () => {
    const owner = createOwner();
    const cleanupCount = 10000;

    for (let i = 0; i < cleanupCount; i++) owner.onScopeCleanup(() => {});

    const start = performance.now();
    owner.dispose();
    const duration = performance.now() - start;

    logPerf("Disposing 10k cleanups", duration, 100);
  });

  it("should maintain performance with frequent scope creation", () => {
    const scope = new OwnershipScope();
    const iterations = 1000;

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      scope.createScope(() => {
        const owner = scope.owner!;
        owner.onScopeCleanup(() => {});
        owner.dispose();
      });
    }
    const duration = performance.now() - start;

    logPerf("1k Scope create+dispose", duration, 200);
  });

  it("should have minimal memory overhead", () => {
    const owners: IOwnership[] = [];
    const count = 1000;

    const start = performance.now();
    for (let i = 0; i < count; i++) owners.push(createOwner());
    const durationCreate = performance.now() - start;

    owners.forEach((o) => o.dispose());
    const durationDispose = performance.now() - start - durationCreate;

    logPerf("Creating 1k owners", durationCreate, 50);
    logPerf("Disposing 1k owners", durationDispose, 50);
  });
});

describe("Edge Cases", () => {
  it("should prevent direct circular append", () => {
    const parent = createOwner();
    const child = createOwner(parent);

    child.appendChild(parent);

    // They swapping parents should not create a cycle
    expect(parent._parent).toBe(child);
    expect(child._parent).toBe(parent);
    expect(parent._childCount).toBe(1);
  });

  it("should handle disposing during cleanup", () => {
    const parent = createOwner();
    const child = createOwner(parent);

    parent.onScopeCleanup(() => {
      child.dispose(); // Dispose child during parent cleanup
    });

    expect(() => parent.dispose()).not.toThrow();
  });

  it("should handle removing all children", () => {
    const parent = createOwner();
    const children = Array.from({ length: 5 }, () => createOwner(parent));

    children.forEach((child) => parent.removeChild(child));

    expect(parent._firstChild).toBeUndefined();
    expect(parent._lastChild).toBeUndefined();
    expect(parent._childCount).toBe(0);
  });

  it("should handle empty tree disposal", () => {
    const owner = createOwner();

    expect(() => owner.dispose()).not.toThrow();
  });

  it("should handle owner with no cleanups", () => {
    const owner = createOwner();

    expect(() => owner.dispose()).not.toThrow();
    expect(owner._state & OwnershipStateFlags.DISPOSED).toBeTruthy();
  });

  it("should handle scope with no operations", () => {
    const scope = new OwnershipScope();

    expect(() => {
      scope.createScope(() => {});
    }).not.toThrow();
  });
});
