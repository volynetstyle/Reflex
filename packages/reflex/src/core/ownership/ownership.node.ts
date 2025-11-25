/**
 * @file ownership.node.ts
 *
 * Optimized OwnershipNode class with fixed layout and bound methods.
 *
 * Replaces interface-based IOwnership with a concrete class
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
  IOwnership,
  IOwnershipContextRecord,
  type ContextKeyType,
  DisposalStrategy,
  DISPOSED,
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
   */
  appendChild(this: IOwnership, child: IOwnership) {
    const node = this;
    const childNode = child;

    childNode._parent = node;
    childNode._nextSibling = null;
    childNode._prevSibling = node._lastChild;

    if (node._lastChild !== null) {
      node._lastChild._nextSibling = childNode;
    } else {
      node._firstChild = childNode;
    }

    node._lastChild = childNode;
    node._childCount++;
  }

  /**
   * removeChild: Remove child from this owner's children list.
   * O(1) operation.
   */
  removeChild(this: IOwnership, child: IOwnership) {
    const node = this;
    const childNode = child;

    if (childNode._parent !== node) return;

    const prev = childNode._prevSibling;
    const next = childNode._nextSibling;

    if (prev !== null) {
      prev._nextSibling = next;
    } else {
      node._firstChild = next;
    }

    if (next !== null) {
      next._prevSibling = prev;
    } else {
      node._lastChild = prev;
    }

    childNode._parent = null;
    childNode._prevSibling = null;
    childNode._nextSibling = null;
    node._childCount--;
  }

  /**
   * onScopeCleanup: Register a cleanup callback.
   * Lazily allocates cleanups array on first call.
   */
  onScopeCleanup(this: IOwnership, fn: NoneToVoidFn) {
    const node = this;

    if (node._flags & DISPOSED) {
      throw new OwnershipDisposeError(["Cannot add cleanup to disposed owner"]);
    }

    if (node._cleanups === null) {
      node._cleanups = [];
    }

    node._cleanups.push(fn);
  }

  /**
   * dispose: Iterative DFS traversal, no recursion.
   * Processes tree bottom-up, runs cleanups, clears links.
   */
  dispose(this: IOwnership, strategy?: DisposalStrategy) {
    const node = this;
    const { beforeDispose, afterDispose, onError } = strategy ?? {};

    if (node._flags & DISPOSED) return;

    beforeDispose?.([this]);

    // Collect all nodes in DFS post-order using explicit stack
    const toDispose: OwnershipNode[] = [];
    const stack: Array<{ node: OwnershipNode; phase: number }> = [
      { node, phase: 0 },
    ];

    while (stack.length > 0) {
      const entry = stack[stack.length - 1]!;
      const current = entry.node;

      if (entry.phase === 0) {
        // First visit: push children
        entry.phase = 1;
        let child = current._lastChild;
        while (child !== null) {
          stack.push({ node: child, phase: 0 });
          child = child._prevSibling;
        }
      } else {
        // Second visit: process node
        stack.pop();
        if (!(current._flags & DISPOSED)) {
          toDispose.push(current);
        }
      }
    }

    // Phase 2: Run cleanups in post-order (already collected that way)
    let errorCount = 0;
    let firstError: unknown;

    for (let i = 0; i < toDispose.length; i++) {
      const n = toDispose[i];
      if (!n || n._flags & DISPOSED) continue;

      const cleanups = n._cleanups;
      n._cleanups = null;

      try {
        if (cleanups !== null) {
          for (let j = cleanups.length - 1; j >= 0; j--) {
            const fn = cleanups[j];
            if (!fn) continue;
            try {
              fn();
            } catch (err) {
              if (!firstError) firstError = err;
              errorCount++;
              onError?.(err, this);
            }
          }
        }
      } finally {
        // Clear all links
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

        // Mark as disposed
        n._firstChild = null;
        n._lastChild = null;
        n._nextSibling = null;
        n._prevSibling = null;
        n._parent = null;
        n._context = null;
        n._childCount = 0;
        n._flags = DISPOSED;
      }
    }

    afterDispose?.([this], errorCount);

    if (errorCount > 0 && !onError) {
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
   */
  getContext(this: IOwnership): IOwnershipContextRecord {
    const node = this;

    if (node._context !== null) {
      return node._context;
    }

    const parentCtx = node._parent?._context;
    const ctx = parentCtx ? Object.create(parentCtx) : Object.create(null);

    node._context = ctx;
    return ctx;
  }

  /**
   * provide: Set context key/value.
   */
  provide(this: IOwnership, key: ContextKeyType, value: unknown): void {
    if (value === this) {
      throw new Error("Cannot provide owner itself into context");
    }
    const ctx = (this as any).getContext();
    ctx[key] = value;
  }

  /**
   * inject: Lookup context value (walks up parent chain).
   */
  inject<T>(this: IOwnership, key: ContextKeyType): T | undefined {
    const node = this;
    let current: OwnershipNode | null = node;

    while (current !== null) {
      if (current._context !== null && Object.hasOwn(current._context, key)) {
        return current._context[key] as T | undefined;
      }
      current = current._parent;
    }

    return undefined;
  }

  /**
   * hasOwn: Check if key exists locally.
   */
  hasOwn(this: IOwnership, key: ContextKeyType): boolean {
    const node = this;
    return node._context !== null && Object.hasOwn(node._context, key);
  }
}

export type OwnershipNode_IOwnershipInternal = Pick<
  OwnershipNode,
  | "_parent"
  | "_firstChild"
  | "_lastChild"
  | "_nextSibling"
  | "_prevSibling"
  | "_context"
  | "_cleanups"
  | "_childCount"
  | "_flags"
  | "_epoch"
  | "_contextEpoch"
>;
