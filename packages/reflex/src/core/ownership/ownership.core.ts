/**
 * @file ownership.core.ts
 * Ownership System - Zero overhead hierarchical resource management
 */

import { ReflexObject } from "../object/inherit";
import { noop } from "../object/inline";
import { batchDisposer, DisposalStrategy } from "./ownership.dispose";
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

    if (child._parent === this) {
      return;
    }

    child._parent = this;
    child._prevSibling = this._lastChild;
    child._nextSibling = undefined;

    if (this._lastChild) {
      this._lastChild._nextSibling = child;
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
  }
};

/**
 * Optimized owner creation with pre-sized disposal array
 */
function createOwner(parent?: IOwnership): IOwnership {
  const owner = ReflexObject.Inherit<IOwnership>(
    OwnershipPrototype as IOwnership
  );

  owner._parent = undefined;
  owner._firstChild = undefined;
  owner._lastChild = undefined;
  owner._nextSibling = undefined;
  owner._prevSibling = undefined;
  owner._disposal = new Array(DISPOSAL_INITIAL_CAPACITY); // Pre-allocate
  owner._disposal.length = 0; // But keep length at 0
  owner._context = undefined; // Will be set by appendChild if needed
  owner._state = OwnershipStateFlags.CLEAN | 0;
  owner._childCount = 0;

  if (parent) {
    parent.appendChild(owner);
    parent.onScopeMount(owner);
  }

  return owner;
}

export { IOwnership, OwnershipPrototype, createOwner };
