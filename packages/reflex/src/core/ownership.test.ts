import {
  IOwnership,
  createOwnershipScope,
  OwnershipPrototype,
} from "./ownership.core";
import { ReflexObject } from "./object/inherit";
import { OwnershipStateFlags } from "./ownership.type";

describe("Ownership System - Extended Tests", () => {
  let runtime: { currentOwner?: IOwnership };

  beforeEach(() => {
    runtime = {};
  });

  // 1. Ownership Scope Creation & currentOwner Management
  test("1. Ownership Scope Creation & currentOwner Management", () => {
    const fn = jest.fn();
    const owner = createOwnershipScope(runtime, fn);

    expect(owner).toBeDefined();
    expect(Object.getPrototypeOf(owner)).toBe(OwnershipPrototype);
    expect(owner._state).toBe(OwnershipStateFlags.CLEAN);
    expect(runtime.currentOwner).toBeUndefined();
    expect(fn).toHaveBeenCalled();
  });

  // 2. appendChild links children and maintains child count
  test("2. appendChild links children and maintains count", () => {
    const parent = ReflexObject.Inherit(OwnershipPrototype);
    const child1 = ReflexObject.Inherit(OwnershipPrototype);
    const child2 = ReflexObject.Inherit(OwnershipPrototype);

    parent.appendChild(child1);
    parent.appendChild(child2);

    expect(parent._firstChild).toBe(child1);
    expect(parent._lastChild).toBe(child2);
    expect(child1._nextSibling).toBe(child2);
    expect(child2._nextSibling).toBeUndefined();
    expect(parent._childCount).toBe(2);
  });

  // 3. Context inheritance via prototype chain
  test("3. Context Inheritance via Prototype Chain", () => {
    const parent = ReflexObject.Inherit(OwnershipPrototype);
    parent._context = { foo: "bar" };

    const child = ReflexObject.Inherit(OwnershipPrototype);
    parent.appendChild(child);

    expect(child._context).not.toBe(parent._context);
    expect(child._context!.foo).toBe("bar");
  });

  // 4. onCleanup registers callbacks and dispose executes them
  test("4. onCleanup Registration & Disposal Execution", () => {
    const owner = ReflexObject.Inherit(OwnershipPrototype);
    const cleanupFn = jest.fn();

    owner.onCleanup(cleanupFn);
    owner.dispose();

    expect(cleanupFn).toHaveBeenCalled();
    expect(owner._disposal).toEqual([]);
    expect(owner._state).toBe(OwnershipStateFlags.DISPOSED);
    expect(owner._childCount).toBe(0);
  });

  // 5. Iterative deep tree disposal
  test("5. Iterative Deep Tree Disposal", () => {
    const parent = ReflexObject.Inherit(OwnershipPrototype);
    const child1 = ReflexObject.Inherit(OwnershipPrototype);
    const child2 = ReflexObject.Inherit(OwnershipPrototype);
    const grandchild = ReflexObject.Inherit(OwnershipPrototype);

    parent.appendChild(child1);
    parent.appendChild(child2);
    child1.appendChild(grandchild);

    const cleanupFns = [jest.fn(), jest.fn(), jest.fn(), jest.fn()];
    parent.onCleanup(cleanupFns[0]);
    child1.onCleanup(cleanupFns[1]);
    child2.onCleanup(cleanupFns[2]);
    grandchild.onCleanup(cleanupFns[3]);

    parent.dispose();

    cleanupFns.forEach((fn) => expect(fn).toHaveBeenCalled());

    [parent, child1, child2, grandchild].forEach((node) => {
      expect(node._state).toBe(OwnershipStateFlags.DISPOSED);
      expect(node._firstChild).toBeUndefined();
      expect(node._lastChild).toBeUndefined();
      expect(node._nextSibling).toBeUndefined();
      expect(node._childCount).toBe(0);
      expect(node._disposal).toEqual([]);
    });
  });

  // 6. Error handling in cleanup callbacks
  test("6. Error Handling in Cleanup Callbacks", () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    const errorCallback = jest.fn(() => {
      throw new Error("Cleanup failed");
    });
    const normalCallback = jest.fn();

    const owner = ReflexObject.Inherit(OwnershipPrototype);
    owner.onCleanup(errorCallback);
    owner.onCleanup(normalCallback);

    owner.dispose();

    expect(normalCallback).toHaveBeenCalled();
    expect(errorCallback).toHaveBeenCalled();
    expect(owner._state).toBe(OwnershipStateFlags.DISPOSED);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[Ownership dispose]: Errors during cleanup",
      expect.arrayContaining([expect.any(Error)])
    );

    consoleErrorSpy.mockRestore();
  });

  // 7. Dispose is idempotent
  test("7. Idempotency of Dispose", () => {
    const owner = ReflexObject.Inherit(OwnershipPrototype);
    const cleanupFn = jest.fn();

    owner.onCleanup(cleanupFn);
    owner.dispose();
    owner.dispose(); // should be a no-op

    expect(cleanupFn).toHaveBeenCalledTimes(1);
    expect(owner._state).toBe(OwnershipStateFlags.DISPOSED);
  });

  // 8. createOwnershipScope restores previous owner
  test("8. Ownership Scope Restores Previous Owner", () => {
    const parentOwner = ReflexObject.Inherit(OwnershipPrototype);
    runtime.currentOwner = parentOwner;

    let newOwner: IOwnership;

    newOwner = createOwnershipScope(runtime, () => {
      // During execution, currentOwner is the new owner
      expect(runtime.currentOwner).not.toBe(parentOwner);
      expect(runtime.currentOwner).toBeDefined();
    });

    // After scope, previous owner is restored
    expect(runtime.currentOwner).toBe(parentOwner);
    expect(newOwner).toBeDefined();
    expect(newOwner._state).toBe(OwnershipStateFlags.CLEAN);
  });

  // 9. Multiple siblings and correct _nextSibling chain
  test("9. Multiple siblings maintain correct _nextSibling chain", () => {
    const parent = ReflexObject.Inherit(OwnershipPrototype);
    const children = Array.from({ length: 4 }, () => ReflexObject.Inherit(OwnershipPrototype));

    children.forEach((child) => parent.appendChild(child));

    expect(parent._firstChild).toBe(children[0]);
    expect(parent._lastChild).toBe(children[3]);

    for (let i = 0; i < children.length - 1; i++) {
      expect(children[i]._nextSibling).toBe(children[i + 1]);
    }
    expect(children[3]._nextSibling).toBeUndefined();
    expect(parent._childCount).toBe(4);
  });

  // 10. Nested disposal of multiple levels
  test("10. Nested disposal disposes all descendants", () => {
    const parent = ReflexObject.Inherit(OwnershipPrototype);
    const child = ReflexObject.Inherit(OwnershipPrototype);
    const grandchild = ReflexObject.Inherit(OwnershipPrototype);

    parent.appendChild(child);
    child.appendChild(grandchild);

    const cleanupFns = [jest.fn(), jest.fn(), jest.fn()];
    parent.onCleanup(cleanupFns[0]);
    child.onCleanup(cleanupFns[1]);
    grandchild.onCleanup(cleanupFns[2]);

    parent.dispose();

    cleanupFns.forEach((fn) => expect(fn).toHaveBeenCalled());
    [parent, child, grandchild].forEach((node) => {
      expect(node._state).toBe(OwnershipStateFlags.DISPOSED);
      expect(node._firstChild).toBeUndefined();
      expect(node._childCount).toBe(0);
    });
  });
});
