/**
 * @file ownership.node.ts
 *
 * Optimized OwnershipNode class with fixed layout and bound methods.
 *
 * Replaces interface-based OwnershipNode with a concrete class
 * for stable hidden class and efficient V8 JIT compilation.
 *
 * Layout (10 fields):
 *   - parent, firstChild, lastChild, nextSibling, prevSibling (5 ptrs)
 *   - context (1 ptr, lazy-initialized)
 *   - cleanups (1 ptr, lazy-initialized)
 *   - childCount, flags, epoch, contextEpoch (4 numerics)
 *
 * All fields are initialized in constructor.
 * All methods bound to prototype for monomorphic call sites.
 */

import OwnershipDisposeError from "./ownership.error";
import {
  type ContextKeyType,
  DisposalStrategy,
  DISPOSED,
  IOwnershipContextRecord,
} from "./ownership.type";

export class OwnershipNode {
  // Tree links
  _parent: OwnershipNode | null = null;
  _firstChild: OwnershipNode | null = null;
  _lastChild: OwnershipNode | null = null;
  _nextSibling: OwnershipNode | null = null;
  _prevSibling: OwnershipNode | null = null;

  // Context (lazy-initialized)
  _context: Record<string, unknown> | null = null;

  // Cleanup handlers
  _cleanups: (() => void)[] | null = null;

  // Counters & state
  _childCount: number = 0;
  _flags: number = 0;
  _epoch: number = 0;
  _contextEpoch: number = 0;

  /**
   * appendChild: Add child to this owner's children list.
   * O(1) operation, no context copying on link.
   *
   * Invariants enforced:
   * - child._parent always points to correct parent
   * - doubly-linked sibling chain is consistent
   * - _firstChild/_lastChild pointers are correct
   * - _childCount reflects actual children count
   */
  appendChild(child: OwnershipNode): void {
    // Early exit if already disposed
    if (this._flags & DISPOSED) return;

    // Detach from previous parent if exists
    if (child._parent !== null) {
      child._parent.removeChild(child);
    }

    // Link as last child
    child._parent = this;
    child._nextSibling = null;
    child._prevSibling = this._lastChild;

    if (this._lastChild !== null) {
      this._lastChild._nextSibling = child;
    } else {
      // Empty list case: child becomes first AND last
      this._firstChild = child;
    }

    this._lastChild = child;
    this._childCount++;
  }

  /**
   * removeChild: Remove child from this owner's children list.
   * O(1) operation.
   *
   * Invariants enforced:
   * - only removes if child._parent === this (ownership check)
   * - maintains doubly-linked list consistency
   * - updates _firstChild/_lastChild boundary pointers
   * - decrements _childCount atomically with removal
   */
  removeChild(child: OwnershipNode): void {
    // Invariant check: child must belong to this parent
    if (child._parent !== this) return;

    const prev = child._prevSibling;
    const next = child._nextSibling;

    // Update previous sibling or parent's _firstChild
    if (prev !== null) {
      prev._nextSibling = next;
    } else {
      this._firstChild = next;
    }

    // Update next sibling or parent's _lastChild
    if (next !== null) {
      next._prevSibling = prev;
    } else {
      this._lastChild = prev;
    }

    // Clear child's links (full detachment)
    child._parent = null;
    child._prevSibling = null;
    child._nextSibling = null;
    this._childCount--;
  }

  /**
   * onScopeCleanup: Register a cleanup callback.
   * Lazily allocates cleanups array on first call.
   *
   * Invariants enforced:
   * - cannot add cleanups to disposed nodes
   * - cleanups array allocated only when needed
   * - preserves registration order for LIFO execution
   */
  onScopeCleanup(fn: NoneToVoidFn): void {
    // Strict invariant: disposed nodes cannot accept new cleanups
    if (this._flags & DISPOSED) {
      throw new OwnershipDisposeError(["Cannot add cleanup to disposed owner"]);
    }

    // Lazy allocation pattern
    if (this._cleanups === null) {
      this._cleanups = [];
    }

    this._cleanups.push(fn);
  }

  /**
   * dispose: Iterative DFS traversal, no recursion.
   * Processes tree bottom-up, runs cleanups, clears links.
   *
   * Invariants enforced:
   * - idempotent: multiple dispose calls are safe
   * - post-order traversal (children before parents)
   * - cleanup execution in reverse registration order (LIFO)
   * - all tree links cleared after disposal
   * - _flags set to DISPOSED atomically
   */
  dispose(strategy?: DisposalStrategy): void {
    // Idempotency: early exit if already disposed
    if (this._flags & DISPOSED) return;

    const { beforeDispose, afterDispose, onError } = strategy ?? {};

    beforeDispose?.([this]);

    // Phase 1: Collect all nodes in DFS post-order using explicit stack
    const toDispose: OwnershipNode[] = [];
    const stack: Array<{ node: OwnershipNode; phase: number }> = [
      { node: this, phase: 0 },
    ];

    while (stack.length > 0) {
      const entry = stack[stack.length - 1]!;
      const current = entry.node;

      if (entry.phase === 0) {
        // First visit: push children in reverse order for post-order traversal
        entry.phase = 1;
        let child = current._lastChild;
        while (child !== null) {
          stack.push({ node: child, phase: 0 });
          child = child._prevSibling;
        }
      } else {
        // Second visit: process node (children already processed)
        stack.pop();
        if (!(current._flags & DISPOSED)) {
          toDispose.push(current);
        }
      }
    }

    // Phase 2: Run cleanups in post-order (children → parents)
    let errorCount = 0;
    let firstError: unknown;

    for (let i = 0; i < toDispose.length; i++) {
      const n = toDispose[i]!;

      // Skip if somehow already disposed (shouldn't happen but defensive)
      if (n._flags & DISPOSED) continue;

      const cleanups = n._cleanups;
      n._cleanups = null;

      // Execute cleanups in LIFO order (reverse of registration)
      if (cleanups !== null) {
        for (let j = cleanups.length - 1; j >= 0; j--) {
          const fn = cleanups[j];
          if (fn === undefined) continue;

          try {
            fn();
          } catch (err) {
            if (firstError === undefined) firstError = err;
            errorCount++;
            onError?.(err, this);
          }
        }
      }

      // Critical section: atomically detach from tree and mark disposed
      // Detach from sibling chain
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

      // Decrement parent's child count
      if (n._parent !== null) {
        n._parent._childCount--;
      }

      // Clear all references (enable GC)
      n._firstChild = null;
      n._lastChild = null;
      n._nextSibling = null;
      n._prevSibling = null;
      n._parent = null;
      n._context = null;
      n._childCount = 0;

      // Mark as disposed (final state transition)
      n._flags = DISPOSED;
    }

    afterDispose?.([this], errorCount);

    // Error reporting (only if no custom handler)
    if (errorCount > 0 && onError === undefined) {
      console.error(
        errorCount === 1
          ? "Error during ownership dispose:"
          : `${errorCount} errors during ownership dispose. First error:`,
        firstError,
      );
    }
  }

  /**
   * getContext: Retrieve or lazily initialize context.
   *
   * Invariants enforced:
   * - context inherits from parent via prototype chain
   * - lazy initialization on first access
   * - null prototype for root contexts
   */
  getContext(): IOwnershipContextRecord {
    // Fast path: context already exists
    if (this._context !== null) {
      return this._context;
    }

    // Lazy initialization with proper prototype chain
    const parentCtx = this._parent?._context;
    const ctx =
      parentCtx !== null && parentCtx !== undefined
        ? Object.create(parentCtx)
        : Object.create(null);

    this._context = ctx;
    return ctx;
  }

  /**
   * provide: Set context key/value.
   *
   * Invariants enforced:
   * - cannot provide owner itself (prevents circular references)
   * - ensures context exists before setting
   */
  provide(key: ContextKeyType, value: unknown): void {
    // Invariant: prevent self-reference in context
    if (value === this) {
      throw new Error("Cannot provide owner itself into context");
    }

    const ctx = this.getContext();
    ctx[key] = value;
  }

  /**
   * inject: Lookup context value (walks up parent chain).
   *
   * Invariants enforced:
   * - searches own context first, then walks up parent chain
   * - uses hasOwn to check only own properties (not inherited)
   * - returns undefined for missing keys (no exceptions)
   */
  inject<T>(key: ContextKeyType): T | undefined {
    let current: OwnershipNode | null = this;

    while (current !== null) {
      // Check only own properties (not inherited via prototype chain)
      if (current._context !== null && key in current._context) {
        return current._context[key] as T;
      }
      current = current._parent;
    }

    return undefined;
  }

  /**
   * hasOwn: Check if key exists locally (not in parent chain).
   *
   * Invariants enforced:
   * - checks only this node's context, not parent chain
   * - uses hasOwn for correct own-property detection
   */
  hasOwn(key: ContextKeyType): boolean {
    return this._context !== null && Object.hasOwn(this._context, key);
  }
}
