import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createOwner } from "#reflex/core/ownership/ownership.core.js";
import { OwnershipStateFlags } from "#reflex/core/ownership/ownership.type.js";
import { createOwnershipScope } from "#reflex/core/ownership/ownership.scope.js";

const isClean = (o: any) => o._state === OwnershipStateFlags.CLEAN;
const isDisposed = (o: any) => o._state === OwnershipStateFlags.DISPOSED;
const isDisposing = (o: any) => o._state === OwnershipStateFlags.DISPOSING;

describe("OwnershipPrototype — Core Behavior", () => {
    describe("appendChild/removeChild", () => {
        it("should attach child and establish parent relationship", () => {
            const parent = createOwner();
            const child = createOwner();

            parent.appendChild(child);

            expect(child._owner).toBe(parent);
            expect(parent._children.size()).toBe(1);
            expect(parent._children.has(child)).toBe(true);
        });

        it("should detach child from previous parent before re-attaching", () => {
            const parent1 = createOwner();
            const parent2 = createOwner();
            const child = createOwner();

            parent1.appendChild(child);
            expect(parent1._children.size()).toBe(1);

            parent2.appendChild(child);
            expect(child._owner).toBe(parent2);
            expect(parent1._children.size()).toBe(0);
            expect(parent2._children.size()).toBe(1);
        });

        it("should be idempotent when appending same child multiple times", () => {
            const parent = createOwner();
            const child = createOwner();

            parent.appendChild(child);
            parent.appendChild(child);
            parent.appendChild(child);

            expect(parent._children.size()).toBe(1);
            expect(child._owner).toBe(parent);
        });

        it("should throw when trying to append owner to itself", () => {
            const owner = createOwner();
            expect(() => owner.appendChild(owner)).toThrow("Cannot append owner to itself");
        });

        it("should throw when appending to disposed owner", () => {
            const parent = createOwner();
            const child = createOwner();

            parent.dispose();

            expect(() => parent.appendChild(child)).toThrow();
            expect(isDisposed(parent)).toBe(true);
        });

        it("should safely remove non-existent child", () => {
            const parent = createOwner();
            const child = createOwner();

            expect(() => parent.removeChild(child)).not.toThrow();
            expect(parent._children.size()).toBe(0);
        });

        it("should detach child reference after removal", () => {
            const parent = createOwner();
            const child = createOwner();

            parent.appendChild(child);
            parent.removeChild(child);

            expect(child._owner).toBeUndefined();
            expect(parent._children.size()).toBe(0);
        });

        // it("should prevent circular ownership chains", () => {
        //     const owner1 = createOwner();
        //     const owner2 = createOwner();

        //     owner1.appendChild(owner2);

        //     // owner2 cannot become parent of owner1
        //     owner2.appendChild(owner1);

        //     // owner1 should be detached from owner2 before becoming its child
        //     expect(owner1._owner).toBe(owner2);
        //     expect(owner2._children.has(owner1)).toBe(true);
        //     expect(owner1._children.has(owner2)).toBe(false);
        // });
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

            expect(owner._context).toBe;
            const ctx = owner.getContext();
            expect(owner._context).toBeDefined();
            expect(ctx).toBe(owner._context);
        });

        it("should inherit parent context lazily", () => {
            const parent = createOwner();
            parent.provide("x", 5);

            const child = createOwner(parent);
            expect(child._context).toStrictEqual(Object.create(null));

            const value = child.inject("x");
            expect(value).toBe(5);
            expect(child._context).toBeDefined();
        });

        it("should prevent providing owner itself in context", () => {
            const owner = createOwner();
            expect(() => owner.provide("self", owner)).toThrow("Cannot provide owner itself");
        });

        it("should support symbol keys in context", () => {
            const owner = createOwner();
            const key = Symbol("test");

            owner.provide(key, "symbol-value");
            expect(owner.inject(key)).toBe("symbol-value");
            expect(owner.hasOwn(key)).toBe(true);
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
            owner.dispose();

            expect(spy).toHaveBeenCalledTimes(1);
        });

        it("should execute multiple cleanup callbacks in LIFO order", () => {
            const owner = createOwner();
            const order: number[] = [];

            owner.onScopeCleanup(() => order.push(1));
            owner.onScopeCleanup(() => order.push(2));
            owner.onScopeCleanup(() => order.push(3));

            owner.dispose();

            expect(order).toEqual([3, 2, 1]);
        });

        it("should throw when adding cleanup to disposed owner", () => {
            const owner = createOwner();
            owner.dispose();

            expect(() => owner.onScopeCleanup(() => { })).toThrow();
        });

        it("should initialize disposal array lazily", () => {
            const owner = createOwner();
            expect(owner._disposal).toBeUndefined();

            owner.onScopeCleanup(() => { });
            expect(owner._disposal).toBeDefined();
            expect(Array.isArray(owner._disposal)).toBe(true);
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

            root.dispose();

            expect(order).toEqual(["grandchild", "child1", "child2", "root"]);
        });


        it("should mark all nodes as DISPOSED after cleanup", () => {
            const root = createOwner();
            const child = createOwner(root);

            root.dispose();

            expect(isDisposed(root)).toBe(true);
            expect(isDisposed(child)).toBe(true);
        });

        it("should mark nodes as DISPOSING during cleanup", () => {
            const owner = createOwner();
            let stateSnapshot: number | undefined;

            owner.onScopeCleanup(() => {
                stateSnapshot = owner._state;
            });

            owner.dispose();

            expect(stateSnapshot).toBe(OwnershipStateFlags.DISPOSING);
        });

        it("should be idempotent (multiple dispose calls safe)", () => {
            const owner = createOwner();
            const spy = vi.fn();

            owner.onScopeCleanup(spy);
            owner.dispose();
            owner.dispose();
            owner.dispose();

            expect(spy).toHaveBeenCalledTimes(1);
            expect(isDisposed(owner)).toBe(true);
        });

        it("should clear references after disposal", () => {
            const owner = createOwner();
            owner.provide("x", 1);
            owner.onScopeCleanup(() => { });

            const child = createOwner(owner);

            owner.dispose();

            expect(owner._disposal).toBeUndefined();
            expect(owner._context).toBeUndefined();
            expect(owner._children.size()).toBe(0);
        });

        it("should continue cleanup despite errors in cleanup callbacks", () => {
            const owner = createOwner();
            const spy1 = vi.fn();
            const spy2 = vi.fn(() => { throw new Error("cleanup error"); });
            const spy3 = vi.fn();

            owner.onScopeCleanup(spy1);
            owner.onScopeCleanup(spy2);
            owner.onScopeCleanup(spy3);

            const consoleError = vi.spyOn(console, "error").mockImplementation(() => { });

            owner.dispose();

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

            owner.onScopeCleanup(() => { throw new Error("error1"); });
            owner.onScopeCleanup(() => { throw new Error("error2"); });

            owner.dispose({
                onError: (err) => errors.push(err)
            });

            expect(errors).toHaveLength(2);
            expect(isDisposed(owner)).toBe(true);
        });

        it("should call beforeDispose and afterDispose hooks", () => {
            const owner = createOwner();
            const hooks: string[] = [];

            owner.dispose({
                beforeDispose: () => hooks.push("before"),
                afterDispose: () => hooks.push("after")
            });

            expect(hooks).toEqual(["before", "after"]);
        });

        it("should pass error count to afterDispose", () => {
            const owner = createOwner();
            let errorCount = -1;

            owner.onScopeCleanup(() => { throw new Error("fail"); });

            owner.dispose({
                afterDispose: (_, count) => { errorCount = count; },
                onError: () => { }
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

            child1.dispose();
            root.dispose();

            expect(spy1).toHaveBeenCalledTimes(1);
            expect(spy2).toHaveBeenCalledTimes(1);
        });
    });

    describe("Edge Cases & Safety", () => {
        it("should handle empty ownership tree", () => {
            const owner = createOwner();
            expect(() => owner.dispose()).not.toThrow();
            expect(isDisposed(owner)).toBe(true);
        });

        it("should handle deeply nested trees", () => {
            let current = createOwner();
            const depth = 100;

            for (let i = 0; i < depth; i++) {
                const child = createOwner(current);
                current = child;
            }

            expect(() => current._owner?.dispose()).not.toThrow();
        });

        it("should handle wide trees with many children", () => {
            const root = createOwner();
            const childCount = 1000;

            for (let i = 0; i < childCount; i++) {
                createOwner(root);
            }

            expect(root._children.size()).toBe(childCount);
            expect(() => root.dispose()).not.toThrow();
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

            owner.onScopeCleanup(() => { });
            expect(isClean(owner)).toBe(true);

            owner.provide("x", 1);
            expect(isClean(owner)).toBe(true);

            owner.dispose();
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
        expect(scope.getOwner()).toBeUndefined();
    });

    describe("withOwner", () => {
        it("should set and restore current owner", () => {
            const owner = createOwner();
            let seenOwner: any;

            scope.withOwner(owner, () => {
                seenOwner = scope.getOwner();
            });

            expect(seenOwner).toBe(owner);
            expect(scope.getOwner()).toBeUndefined();
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

            expect(scope.getOwner()).toBeUndefined();
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

            expect(scope.getOwner()).toBeUndefined();
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
            expect(childOwner._owner).toBe(parent);
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
            expect(rootOwner._owner).toBeUndefined();
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
            expect(owners[1]._owner).toBe(owners[0]);
            expect(owners[2]._owner).toBe(owners[1]);
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

            expect(scope.getOwner()).toBeUndefined();
        });
    });

    describe("getOwner", () => {
        it("should return undefined when no owner set", () => {
            expect(scope.getOwner()).toBeUndefined();
        });

        it("should return current owner", () => {
            const owner = createOwner();

            scope.withOwner(owner, () => {
                expect(scope.getOwner()).toBe(owner);
            });
        });
    });
});

// describe("Memory & Performance", () => {
//   it("should not leak references after disposal", () => {
//     const root = createOwner();
//     const child = createOwner(root);

//     child.provide("data", { large: new Array(1000).fill(0) });
//     child.onScopeCleanup(() => {});

//     root.dispose();

//     expect(child._context).toBeUndefined();
//     expect(child._disposal).toBeUndefined();
//     expect(child._owner).toBeDefined(); // Parent link remains but child is disposed
//   });

//   it("should handle rapid create/dispose cycles", () => {
//     const iterations = 1000;

//     for (let i = 0; i < iterations; i++) {
//       const owner = createOwner();
//       owner.onScopeCleanup(() => {});
//       owner.dispose();
//     }

//     expect(true).toBe(true); // No crash
//   });
