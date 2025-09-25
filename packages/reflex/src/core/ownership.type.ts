/**
 * Internal state flags for an Ownership node.
 * Uses bitwise flags for fast checks.
 */
const enum OwnershipStateFlags {
  /** Node is clean, no pending updates. */
  CLEAN = 0,
  /** Node is scheduled for a check (validation). */
  CHECK = 1 << 0,
  /** Node has pending updates (dirty). */
  DIRTY = 1 << 1,
  /** Node has been disposed and should not be reused. */
  DISPOSED = 1 << 2,
}

/**
 * IOwnership represents a single node in the Ownership Tree.
 *
 * Conceptually, an "Owner" is a lightweight unit of resource tracking:
 * - It can own children (other owners).
 * - It can store contextual information.
 * - It can register cleanup callbacks that run when disposed.
 *
 * Ownership provides the hierarchical backbone of the reactive system:
 * - Parent/child relations define scope.
 * - Cleanup guarantees determinism and avoids leaks.
 * - Context inheritance allows scoped data without duplication.
 *
 * Fields are defined as optional in the type system (to allow prototype-based
 * instantiation), but in practice, `OwnershipPrototype` initializes them with
 * stable values (`undefined` or defaults) for JIT performance.
 */
interface IOwnership {
  /**
   * The first child node in the ownership chain.
   *
   * Used for fast traversal from parent → child.
   * Together with `_nextSibling`, this forms a singly-linked list of children.
   *
   * Example:
   * ```
   * parent._firstChild → childA → childB → childC
   * ```
   */
  _firstChild?: IOwnership;

  /**
   * The last child node in the ownership chain.
   *
   * Used to append new children in O(1) time without re-traversing the list.
   * Not used for traversal itself — purely an optimization for push-back.
   */
  _lastChild?: IOwnership;

  /**
   * The next sibling in the child list of the same parent.
   *
   * Enables linear traversal of siblings without recursion.
   * This avoids needing a `_prevSibling`, saving memory and reducing shape complexity.
   */
  _nextSibling?: IOwnership;

  /**
   * Registered cleanup callbacks for this node.
   *
   * - Added via `onCleanup(fn)`.
   * - Executed in order when `dispose()` is called.
   * - After execution, this array is cleared to free memory.
   *
   * Typical usage: unsubscribing listeners, canceling timers, releasing resources.
   */
  _disposal: NoneToVoidFn[];

  /**
   * The context object associated with this node.
   *
   * Contexts are chained via prototypes:
   * - When a child is created, its context is `Object.create(parent._context)`.
   * - Lookups fall back to parent scopes naturally (prototype chain).
   * - Writes (set) only affect the current scope.
   *
   * This gives cheap "scoped variables" without deep cloning.
   */
  _context?: Record<string | symbol, unknown>;

  /**
   * Bitwise flags representing the node’s current state.
   *
   * Possible values (see `OwnershipStateFlags`):
   * - CLEAN (0) → normal state.
   * - CHECK → node is scheduled for validation.
   * - DIRTY → node has pending updates.
   * - DISPOSED → node is disposed and should not be reused.
   */
  _state: OwnershipStateFlags;

  /**
   * The number of **direct children** owned by this node.
   *
   * - Does not count grandchildren.
   * - Updated in `appendChild`.
   * - Useful for diagnostics, assertions, or quick emptiness checks.
   */
  _childCount: number;

  /**
   * Append a child node to this owner.
   *
   * Responsibilities:
   * - Updates `_firstChild`, `_lastChild`, and `_nextSibling` links.
   * - Increments `_childCount`.
   * - Initializes the child’s context via prototypal inheritance.
   *
   * Usage:
   * ```ts
   * parent.appendChild(child);
   * ```
   */
  appendChild(child: IOwnership): void;

  /**
   * Register a cleanup callback to run when this node is disposed.
   *
   * Callbacks are executed in the order they were registered.
   * If a callback throws, the error is logged but disposal continues.
   *
   * Usage:
   * ```ts
   * owner.onCleanup(() => console.log("disposed"));
   * ```
   */
  onCleanup(fn: NoneToVoidFn): void;

  /**
   * Dispose this node and all of its descendants.
   *
   * - Traverses children iteratively (avoids recursion & stack overflow).
   * - Executes all registered cleanup callbacks.
   * - Clears references to children, siblings, and context.
   * - Marks the node as DISPOSED to prevent reuse.
   *
   * After calling `dispose`, the node is inert and cannot safely be reattached.
   */
  dispose(): void;
}

export {OwnershipStateFlags};
export type { IOwnership};
