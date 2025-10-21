/**
 * @file ownership.core.ts
 * Ownership System - Zero overhead hierarchical resource management
 */

import { ReflexObject } from "../object/object.inherit";
import { noop } from "../object/object.inline";
import { batchDisposer, DisposalStrategy } from "./ownership.disposal";
import OwnershipDisposeError from "./ownership.error";
import {
  IOwnership,
  IOwnershipMethods,
  OwnershipStateFlags,
} from "./ownership.type";

const DISPOSAL_INITIAL_CAPACITY = 4;

/**
 * Shared prototype for all Owner nodes.
 */
const OwnershipPrototype: IOwnershipMethods = {
  appendChild(this: IOwnership, child: IOwnership) {
    if (!child) {
      return;
    }

    if (child._parent === this) {
      return;
    }

    if (child === this) {
      throw new Error("Cannot append owner to itself");
    }

    if (child._state & OwnershipStateFlags.DISPOSED) {
      throw new Error("Cannot append a disposed child");
    }

    if (this._state & OwnershipStateFlags.DISPOSING) {
      throw new Error("Cannot append child to an owner that is disposing");
    }

    if (child._parent && child._parent !== this) {
      child._parent.removeChild(child);
    }

    child._parent = this;
    child._prevSibling = this._lastChild;
    child._nextSibling = undefined;

    if (this._lastChild) {
      this._lastChild._nextSibling = child;
      child._prevSibling = this._lastChild;
      this._lastChild = child;
    } else {
      this._firstChild = this._lastChild = child;
    }

    if (this._context !== undefined) {
      child._context = ReflexObject.Inherit(this._context);
    }

    ++this._childCount;
  },

  removeChild(this: IOwnership, child: IOwnership) {
    if (child._parent !== this) {
      return;
    }

    const prev = child._prevSibling;
    const next = child._nextSibling;

    if (prev) {
      prev._nextSibling = next;
    }

    if (next) {
      next._prevSibling = prev;
    }

    if (this._firstChild === child) {
      this._firstChild = next;
    }

    if (this._lastChild === child) {
      this._lastChild = prev;
    }

    child._parent = undefined;
    child._prevSibling = undefined;
    child._nextSibling = undefined;

    --this._childCount;
  },

  onScopeMount: noop,

  onScopeCleanup(this: IOwnership, fn: NoneToVoidFn) {
    if (this._state & OwnershipStateFlags.DISPOSED) {
      throw new OwnershipDisposeError(["Cannot add cleanup to disposed owner"]);
    }

    if (!this._disposal) {
      this._disposal = new Array(DISPOSAL_INITIAL_CAPACITY);
      this._disposal.length = 0;
    }

    this._disposal.push(fn);
  },

  dispose(this: IOwnership, strategy?: DisposalStrategy) {
    if (this._state & OwnershipStateFlags.DISPOSED) return;

    const batch: IOwnership[] = [];
    const stack: IOwnership[] = [this];

    while (stack.length) {
      const node = stack.pop()!;
      if (node._state & OwnershipStateFlags.DISPOSED) continue;

      batch.push(node);

      for (let child = node._firstChild; child; child = child._nextSibling) {
        if (!(child._state & OwnershipStateFlags.DISPOSED)) {
          stack.push(child);
        }
      }
    }

    batchDisposer(batch, strategy);
  },

  getContext(this: IOwnership) {
    if (!this._context)
      this._context = ReflexObject.Inherit(this._parent?._context ?? {});
    return this._context;
  },

  provide(this: IOwnership, key: symbol | string, value: unknown) {
    const ctx = this.getContext();
    ctx[key] = value;
  },

  inject<T>(this: IOwnership, key: symbol | string): T | undefined {
    let ctx: any = this._context;

    while (ctx) {
      if (key in ctx) return ctx[key];
      ctx = Object.getPrototypeOf(ctx);
    }

    return undefined;
  },
};

/**
 * Optimized owner creation with pre-sized disposal array
 *
 * Parent_1 Owner
 * ├─ _context: { theme: "dark" }
 * └─ _firstChild → [Owner#A]
 *       ├─ _parent → Parent_1
 *       ├─ _context → Object.create(Parent_1._context)
 *       └─ _disposal → [ fn, fn, fn ]
 */
function createOwner(parent?: IOwnership): IOwnership {
  const owner = ReflexObject.Inherit<IOwnership>(OwnershipPrototype);

  owner._parent = undefined;
  owner._firstChild = undefined;
  owner._lastChild = undefined;
  owner._nextSibling = undefined;
  owner._prevSibling = undefined;
  owner._disposal = new Array(DISPOSAL_INITIAL_CAPACITY); // Pre-allocate
  owner._disposal.length = 0; // But keep length at 0
  owner._context = undefined; // Will be set by appendChild if needed
  owner._state = OwnershipStateFlags.CLEAN;
  owner._childCount = 0;

  if (parent) {
    parent.appendChild(owner);
    parent.onScopeMount(owner);
  }

  return owner;
}

export { IOwnership, OwnershipPrototype, createOwner };
