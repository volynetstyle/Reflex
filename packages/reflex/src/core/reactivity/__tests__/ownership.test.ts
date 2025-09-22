import { ReflexObject } from "../../object/inherit";
import {
  IOwnership,
  OwnershipPrototype,
  createOwnershipScope,
  resolveQueue,
} from "../ownership";

describe("Ownership system", () => {
  let runtime: { currentOwner?: IOwnership };

  beforeEach(() => {
    runtime = {};
  });

  test("createOwnershipScope sets and restores runtime owner", () => {
    let insideOwner: IOwnership | undefined;

    const scope = createOwnershipScope(runtime, () => {
      insideOwner = runtime.currentOwner;
      expect(insideOwner).toBeDefined();
    });

    expect(scope).toBe(insideOwner);
    expect(runtime.currentOwner).toBeUndefined();
  });

  test("appendChild links children correctly and updates childCount", () => {
    const parent: IOwnership = ReflexObject.Inherit({
      ...{},
    }) as unknown as IOwnership;
    Object.assign(parent, {
      ...OwnershipPrototype,
    });

    const child1: IOwnership = ReflexObject.Inherit(
      {}
    ) as unknown as IOwnership;
    const child2: IOwnership = ReflexObject.Inherit(
      {}
    ) as unknown as IOwnership;

    parent.appendChild(child1);
    parent.appendChild(child2);

    expect(parent._firstChild).toBe(child1);
    expect(parent._lastChild).toBe(child2);
    expect(child1._nextSibling).toBe(child2);
    expect(parent._childCount).toBe(2);
  });

  test("context inheritance works via prototype chain", () => {
    const parent = createOwnershipScope(runtime, () => {}, true);
    parent._context = { foo: 123 };

    const child: IOwnership = ReflexObject.Inherit(OwnershipPrototype);
    parent.appendChild(child);

    expect(child._context).not.toBe(parent._context);
    expect((child._context as any).foo).toBe(123);

    // Updating parent context propagates via prototype chain
    (parent._context as any).bar = 456;
    expect((child._context as any).bar).toBe(456);

    // Reassigning parent context should not retroactively update child
    parent._context = { foo: 999 };
    expect((child._context as any).foo).toBe(123);
  });

  test("onCleanup registers and executes callbacks once", () => {
    const owner = createOwnershipScope(runtime, () => {});
    const spy = jest.fn();

    owner.onCleanup(spy);
    expect(spy).not.toHaveBeenCalled();

    owner.dispose();
    expect(spy).toHaveBeenCalledTimes(1);

    // Idempotency: dispose again does nothing
    owner.dispose();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("dispose clears children and marks state", () => {
    const parent = createOwnershipScope(runtime, () => {});
    const child = createOwnershipScope(runtime, () => {});
    parent.appendChild(child);

    parent.dispose();

    expect(parent._firstChild).toBeUndefined();
    expect(parent._lastChild).toBeUndefined();
    expect(parent._state & 4).toBe(4); // DISPOSED
    expect(child._state & 4).toBe(4); // child also disposed
  });

  test("dispose handles deep trees iteratively without stack overflow", () => {
    const root = createOwnershipScope(runtime, () => {});
    let current = root;
    for (let i = 0; i < 10000; i++) {
      const next = createOwnershipScope(runtime, () => {});
      current.appendChild(next);
      current = next;
    }

    expect(() => root.dispose()).not.toThrow();
    expect(root._state & 4).toBe(4);
  });

  test("onCleanup does not block other cleanups if one throws", () => {
    const owner = createOwnershipScope(runtime, () => {});
    const spy = jest.fn();

    owner.onCleanup(() => {
      throw new Error("fail");
    });
    owner.onCleanup(spy);

    owner.dispose();

    // spy всё равно вызывается, несмотря на выброс
    expect(spy).toHaveBeenCalled();
  });

  test("resolveQueue returns global or local queue correctly", () => {
    const globalQ = { global: true };
    const localQ = { local: true };

    const globalOwner = createOwnershipScope(runtime, () => {}, true);
    const localOwner = createOwnershipScope(runtime, () => {}, false);

    expect(resolveQueue(globalOwner, globalQ, localQ)).toBe(globalQ);
    expect(resolveQueue(localOwner, globalQ, localQ)).toBe(localQ);

    // if localOwner has a child using globalQueue, inherits global
    const child = createOwnershipScope(runtime, () => {}, true);
    localOwner.appendChild(child);
    expect(resolveQueue(localOwner, globalQ, localQ)).toBe(globalQ);
  });
});
