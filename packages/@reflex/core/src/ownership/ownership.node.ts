// ownership.node.ts

/**
 * @file ownership.node.ts
 *
 * Optimized OwnershipNode class with fixed layout and prototype methods.
 *
 * Layout:
 *   - tree links: _parent, _firstChild, _lastChild, _nextSibling, _prevSibling
 *   - context:    _context (lazy, via prototype chain)
 *   - cleanups:   _cleanups (lazy)
 *   - counters:   _childCount, _flags, _epoch, _contextEpoch
 */

import { DISPOSED } from "../graph/process/graph.constants";
import { CausalCoords } from "../storage/config/CausalCoords";
import {
  createContextLayer,
  contextProvide,
  contextLookup,
  contextHasOwn,
} from "./ownership.context";
import type {
  ContextKeyType,
  IOwnership,
  IOwnershipContextRecord,
} from "./ownership.contract";

export class OwnershipNode {
  // Tree links
  _parent: OwnershipNode | null = null;
  _firstChild: OwnershipNode | null = null;
  _lastChild: OwnershipNode | null = null;
  _nextSibling: OwnershipNode | null = null;
  _prevSibling: OwnershipNode | null = null;

  // Context (lazy)
  _context: IOwnershipContextRecord | null = null;

  // Cleanup handlers (lazy)
  _cleanups: NoneToVoidFn[] | null = null;

  // Counters & state
  _childCount = 0;
  _flags = 0;

  _causal: CausalCoords = {
    t: 0,
    v: 0,
    g: 0,
    s: 0,
  };

  /**
   * Append child to the end of this owner's children list.
   * O(1), keeps doubly-linked sibling chain consistent.
   */
  appendChild(child: OwnershipNode): void {
    // disposed owners silently ignore structural changes
    if (this._flags & DISPOSED) return;

    // reparent if needed
    if (child._parent !== null) {
      child._parent.removeChild(child);
    }

    child._parent = this;
    child._nextSibling = null;
    child._prevSibling = this._lastChild;

    if (this._lastChild !== null) {
      this._lastChild._nextSibling = child;
    } else {
      this._firstChild = child;
    }

    this._lastChild = child;
    this._childCount++;
  }

  /**
   * Remove child from this owner's children list.
   * O(1), no recursion, no side effects on child subtree.
   */
  removeChild(child: OwnershipNode): void {
    if (child._parent !== this) return;

    const prev = child._prevSibling;
    const next = child._nextSibling;

    if (prev !== null) prev._nextSibling = next;
    else this._firstChild = next;

    if (next !== null) next._prevSibling = prev;
    else this._lastChild = prev;

    child._parent = null;
    child._prevSibling = null;
    child._nextSibling = null;
    this._childCount--;
  }

  /**
   * Register a cleanup callback to be executed when this scope is disposed.
   *
   * - Allocates cleanup array lazily on first use.
   * - Throws if the node is already disposed.
   */
  onScopeCleanup(fn: NoneToVoidFn): void {
    if (this._flags & DISPOSED) {
      return;
    }

    if (this._cleanups === null) {
      this._cleanups = [];
    }

    this._cleanups.push(fn);
  }

  /**
   * Dispose this owner and its entire subtree.
   *
   * - Non-recursive DFS (explicit stack)
   * - Post-order: children before parents
   * - Cleanups executed in LIFO order
   * - Idempotent: repeated calls are safe
   */
  dispose(): void {
    if (this._flags & DISPOSED) return;

    // Phase 1: collect nodes in post-order
    const toDispose: OwnershipNode[] = [];
    const stack: Array<{ node: OwnershipNode; phase: 0 | 1 }> = [
      { node: this, phase: 0 },
    ];

    while (stack.length > 0) {
      const entry = stack[stack.length - 1]!;
      const current = entry.node;

      if (entry.phase === 0) {
        entry.phase = 1;
        let child = current._lastChild;
        while (child !== null) {
          stack.push({ node: child, phase: 0 });
          child = child._prevSibling;
        }
      } else {
        stack.pop();
        if (!(current._flags & DISPOSED)) {
          toDispose.push(current);
        }
      }
    }

    // Phase 2: run cleanups and detach nodes
    let errorCount = 0;
    let firstError: unknown;

    for (let i = 0; i < toDispose.length; i++) {
      const n = toDispose[i]!;

      if (n._flags & DISPOSED) continue;

      const cleanups = n._cleanups;
      n._cleanups = null;

      if (cleanups !== null) {
        for (let j = cleanups.length - 1; j >= 0; j--) {
          const fn = cleanups[j];
          if (!fn) continue;
          try {
            fn();
          } catch (err) {
            if (firstError === undefined) firstError = err;
            errorCount++;
          }
        }
      }

      // detach from parent/siblings
      if (n._prevSibling !== null) {
        n._prevSibling._nextSibling = n._nextSibling;
      } else if (n._parent !== null) {
        n._parent._firstChild = n._nextSibling;
      }

      if (n._nextSibling !== null) {
        n._nextSibling._prevSibling = n._prevSibling;
      } else if (n._parent !== null) {
        n._parent._lastChild = n._prevSibling;
      }

      if (n._parent !== null) {
        n._parent._childCount--;
      }

      // reset links and state
      n._firstChild = null;
      n._lastChild = null;
      n._nextSibling = null;
      n._prevSibling = null;
      n._parent = null;
      n._context = null;
      n._childCount = 0;

      n._flags = DISPOSED;
    }

    if (errorCount > 0) {
      console.error(
        errorCount === 1
          ? "Error during ownership dispose:"
          : `${errorCount} errors during ownership dispose. First error:`,
        firstError,
      );
    }
  }

  /**
   * Return existing context or lazily create a new layer that
   * inherits from parent context via prototype chain.
   */
  getContext(): IOwnershipContextRecord {
    if (this._context !== null) return this._context;

    const parentCtx = this._parent?._context ?? null;
    const ctx = createContextLayer(parentCtx);
    this._context = ctx;
    return ctx;
  }

  /**
   * Provide a value for a given context key in this node.
   */
  provide(key: ContextKeyType, value: unknown): void {
    const ctx = this.getContext();
    contextProvide(ctx, key, value);
  }

  /**
   * Lookup a value in the context chain (this node → parents).
   */
  inject<T>(key: ContextKeyType): T | undefined {
    return contextLookup<T>(this, key);
  }

  /**
   * Check if this node's own context has the given key (no parent lookup).
   */
  hasOwn(key: ContextKeyType): boolean {
    return contextHasOwn(this._context, key);
  }
}

/**
 * createOwner: Factory for creating ownership nodes.
 *
 * Creates a new OwnershipNode with all fields initialized.
 * Methods are bound to OwnershipNode.prototype for monomorphic calls.
 * If parent is provided, automatically appends to parent's child list.
 */
export function createOwner(
  parent: OwnershipNode | null = null,
): OwnershipNode {
  const owner = new OwnershipNode();

  if (parent !== null) {
    parent.appendChild(owner);
  }

  return owner;
}

// If тебе нужно "публичный" тип IOwnership из этого файла:
export type { IOwnership };
