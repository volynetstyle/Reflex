/**
 * @file ownership.optimized.ts
 * Optimized Ownership System - Zero overhead hierarchical resource management
 */

import { ReflexObject } from "../object/inherit";
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
    // Fast path: already attached
    if (child._parent === this) return;

    // Check child state
    if (child._state & OwnershipStateFlags.DISPOSED) {
      throw new Error("Cannot append a disposed child");
    }

    // Check parent state
    if (this._state & OwnershipStateFlags.DISPOSING) {
      throw new Error("Cannot append child to an owner that is disposing");
    }

    // Detach from previous parent if needed
    if (child._parent) {
      child._parent.removeChild(child);
    }

    // Update pointers
    child._parent = this;
    child._prevSibling = this._lastChild;
    child._nextSibling = undefined;

    if (this._lastChild) {
      this._lastChild._nextSibling = child;
      this._lastChild = child;
    } else {
      this._firstChild = this._lastChild = child;
    }

    // Inherit context only if parent has one (avoid unnecessary object creation)
    if (this._context !== undefined) {
      child._context = ReflexObject.Inherit(this._context);
    }

    ++this._childCount;
  },

  removeChild(this: IOwnership, child: IOwnership) {
    if (child._parent !== this) return;

    const prev = child._prevSibling;
    const next = child._nextSibling;

    // Update sibling links
    if (prev) prev._nextSibling = next;
    if (next) next._prevSibling = prev;

    // Update parent links
    if (this._firstChild === child) this._firstChild = next;
    if (this._lastChild === child) this._lastChild = prev;

    // Clear child references
    child._parent = child._prevSibling = child._nextSibling = undefined;

    --this._childCount;
  },

  onScopeMount: undefined,

  onScopeCleanup(this: IOwnership, fn: NoneToVoidFn) {
    if (this._state & OwnershipStateFlags.DISPOSED) {
      throw new OwnershipDisposeError(["Cannot add cleanup to disposed owner"]);
    }

    if (!this._disposal) {
      this._disposal = new Array(2); // Smaller initial size
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

      let child = node._firstChild;
      while (child) {
        stack.push(child);
        child = child._nextSibling;
      }
    }

    batchDisposer(batch, strategy);
  },
};

/**
 * Optimized owner creation with pre-sized disposal array
 */
function createOwner(parent?: IOwnership): IOwnership {
  const owner = ReflexObject.Inherit<IOwnership>(
    OwnershipPrototype as IOwnership
  );

  // Initialize with stable hidden class
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

  // Attach to parent and inherit context
  if (parent) {
    parent.appendChild(owner);

    // Inline mount callback check
    if (parent.onScopeMount) {
      parent.onScopeMount(owner);
    }
  }

  return owner;
}

export { IOwnership, OwnershipPrototype, createOwner };
