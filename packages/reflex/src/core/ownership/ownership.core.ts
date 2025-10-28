/**
 * @file ownership.core.ts
 * @description
 * Reflex Ownership System — zero-overhead hierarchical resource manager.
 *
 * Provides deterministic parent-child ownership, scoped disposal, and
 * contextual inheritance with minimal runtime cost. Each owner represents
 * a self-contained lifetime scope that can attach children, propagate
 * cleanup, and share contextual data down its hierarchy.
 */

import { ReflexObject } from "../object/object.inherit";
import { noop } from "../object/object.inline";
import { batchDisposer, DisposalStrategy } from "./ownership.disposal";
import OwnershipDisposeError from "./ownership.error";
import {
  IOwnership,
  IOwnershipContextRecord,
  IOwnershipMethods,
  NoneToVoidFn,
  OwnershipStateFlags,
} from "./ownership.type";

const DISPOSAL_INITIAL_CAPACITY = 4;

/**
 * @constant OwnershipPrototype
 *
 * Shared method table for all `Owner` instances.
 *
 * Designed for flat inlining and stable hidden class shape in V8.
 */
const OwnershipPrototype: IOwnershipMethods = {
  /**
   * Links a child owner under the current parent.
   * Ensures deterministic parent-child hierarchy without duplicates.
   */
  appendChild(this: IOwnership, child: IOwnership) {
    if (!child || child._parent === this) return;
    if (child === this) throw new Error("Cannot append owner to itself");
    if (child._state & OwnershipStateFlags.DISPOSED)
      throw new Error("Cannot append a disposed child");
    if (this._state & OwnershipStateFlags.DISPOSING)
      throw new Error("Cannot append child to a disposing owner");

    // If child already attached elsewhere — detach first
    if (child._parent && child._parent !== this) {
      child._parent.removeChild(child);
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

    const parentContext = this._context;
    if (parentContext !== undefined) {
      child._context = ReflexObject.Inherit(parentContext);
    }

    ++this._childCount;
  },

  /**
   * Detaches a child from the current owner without disposing it.
   */
  removeChild(this: IOwnership, child: IOwnership) {
    if (child._parent !== this) return;

    const prev = child._prevSibling;
    const next = child._nextSibling;

    if (prev) prev._nextSibling = next;
    if (next) next._prevSibling = prev;

    if (this._firstChild === child) this._firstChild = next;
    if (this._lastChild === child) this._lastChild = prev;

    child._parent = child._prevSibling = child._nextSibling = undefined;
    --this._childCount;
  },

  /** Called when a scope is first attached (can be overridden). */
  onScopeMount: noop,

  /**
   * Registers a cleanup function to execute when this owner is disposed.
   * Lazily allocates a disposal array on first call.
   */
  onScopeCleanup(this: IOwnership, fn: NoneToVoidFn) {
    if (this._state & OwnershipStateFlags.DISPOSED)
      throw new OwnershipDisposeError(["Cannot add cleanup to disposed owner"]);

    if (!this._disposal) {
      this._disposal = new Array(DISPOSAL_INITIAL_CAPACITY);
      this._disposal.length = 0;
    }

    this._disposal.push(fn);
  },

  /**
   * Recursively disposes this owner and all its descendants.
   * Performs iterative stack traversal to avoid recursion depth limits.
   */
  dispose(this: IOwnership, strategy?: DisposalStrategy) {
    if (this._state & OwnershipStateFlags.DISPOSED) return;

    const batch: IOwnership[] = [];
    const stack: IOwnership[] = [this];

    while (stack.length) {
      const node = stack.pop()!;
      if (node._state & OwnershipStateFlags.DISPOSED) continue;

      batch.push(node);

      for (let child = node._firstChild; child; child = child._nextSibling) {
        if (!(child._state & OwnershipStateFlags.DISPOSED)) stack.push(child);
      }
    }

    batchDisposer(batch, strategy);
  },

  /**
   * Returns current owner context, creating one if necessary.
   * Contexts form a prototype chain inherited from parent scopes.
   */
  getContext(this: IOwnership): IOwnershipContextRecord {
    return (this._context ||= ReflexObject.Inherit(
      this._parent?._context ?? {}
    ));
  },

  /**
   * Provides a value into the current owner’s context.
   * Child scopes will inherit it via prototype chain.
   */
  provide(this: IOwnership, key: symbol | string, value: unknown) {
    const ctx = this.getContext();
    ctx[key] = value;
  },

  /**
   * Resolves a context value from the current or any ancestor scope.
   */
  inject<T>(this: IOwnership, key: symbol | string): T | undefined {
    if (!this._context) return undefined;

    return this._context[key] as T;
  },

  hasOwn(this: IOwnership, key: symbol | string): boolean {
    return this._context !== undefined && Object.hasOwn(this._context, key);
  },
};

/**
 * Creates a new ownership node.
 * Lightweight factory with stable object shape for V8 optimization.
 *
 * @example
 * const root = createOwner();
 * const child = createOwner(root);
 * child.onScopeCleanup(() => console.log("disposed"));
 * root.dispose(); // → cleans up child and its resources
 */
function createOwner(parent?: IOwnership): IOwnership {
  const owner: IOwnership = {
    ...OwnershipPrototype,
    _parent: undefined,
    _firstChild: undefined,
    _lastChild: undefined,
    _nextSibling: undefined,
    _prevSibling: undefined,
    _disposal: undefined,
    _context: undefined,
    _state: OwnershipStateFlags.CLEAN,
    _childCount: 0,
  };

  if (parent) {
    parent.appendChild(owner);
    parent.onScopeMount(owner);
  }

  return owner;
}

export { IOwnership, OwnershipPrototype, createOwner };
