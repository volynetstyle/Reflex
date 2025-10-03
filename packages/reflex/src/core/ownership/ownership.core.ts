/**
 * @file ownership.optimized.ts
 * Optimized Ownership System - Zero overhead hierarchical resource management
 */

import { ReflexObject } from "../object/inherit";
import OwnershipDisposeError from "./ownership.error";
import {
  IOwnership,
  IOwnershipMethods,
  OwnershipStateFlags,
} from "./ownership.type";

// Pre-allocate disposal array size to reduce allocations
const DISPOSAL_INITIAL_CAPACITY = 4;

// Bit flags for faster state checks
const DISPOSED_OR_DISPOSING =
  OwnershipStateFlags.DISPOSED | OwnershipStateFlags.DISPOSING;

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

    this._childCount++;
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
    this._childCount--;
  },

  onScopeMount: undefined,

  onScopeCleanup(this: IOwnership, fn: NoneToVoidFn) {
    this._disposal.push(fn);
  },

  dispose(this: IOwnership) {
    if (this._state & OwnershipStateFlags.DISPOSED) return;

    // Collect all nodes to dispose using iterative traversal
    const batch: IOwnership[] = [];
    const stack: IOwnership[] = [this];

    while (stack.length > 0) {
      const current = stack.pop()!;

      // Skip already disposed nodes
      if (current._state & OwnershipStateFlags.DISPOSED) continue;

      batch.push(current);

      // Add all children to stack
      let child = current._firstChild;

      while (child) {
        stack.push(child);
        child = child._nextSibling;
      }
    }

    // Dispose collected nodes
    disposeBatch(batch);
  },
};

/**
 * Optimized batch disposal with minimal allocations
 */
function disposeBatch(nodes: IOwnership[]) {
  let firstError: unknown = undefined;
  let errorCount = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    // Mark as disposing to prevent appendChild during cleanup
    node._state |= OwnershipStateFlags.DISPOSING;

    // Execute cleanups
    const disposal = node._disposal;
    const len = disposal.length;

    for (let j = 0; j < len; j++) {
      try {
        disposal[j]();
      } catch (err) {
        if (!firstError) firstError = err;
        errorCount++;
      }
    }

    // Clear references in one go
    node._disposal.length = 0;
    node._firstChild = undefined;
    node._lastChild = undefined;
    node._nextSibling = undefined;
    node._prevSibling = undefined;
    node._parent = undefined;
    node._context = undefined;
    node._childCount = 0;
    node._state = OwnershipStateFlags.DISPOSED;
  }

  // Report errors without allocating array if only one error
  if (errorCount > 0) {
    if (errorCount === 1) {
      console.error("Error during ownership dispose:", firstError);
    } else {
      console.error(
        `${errorCount} errors during ownership dispose. First error:`,
        firstError
      );
    }
  }
}

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
  owner._state = OwnershipStateFlags.CLEAN;
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
