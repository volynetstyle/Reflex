/**
 * @file ownership.type.ts
 * Types, symbols, and flags for Ownership system.
 * Provides core building blocks for reactive ownership, context, and cleanup.
 */

/** Unique identifier for general purpose internal ID. */
const S_ID: unique symbol = Symbol.for("id");
/** Internal reference to the owner of a reactive node. */
const S_OWN: unique symbol = Symbol.for("ownership");
/** Internal source nodes for memoization/tracking dependencies. */
const S_SOURCES: unique symbol = Symbol.for("sources");
/** Internal subscribers for reactive nodes. */
const S_SUBS: unique symbol = Symbol.for("subscribers");
/** Marks a node as dirty or needing update. */
const S_DIRTY: unique symbol = Symbol.for("dirty");
/** Stores the function for memo/effect computation. */
const S_FN: unique symbol = Symbol.for("fn");
/** Holds the current value of a signal/memo. */
const S_VALUE: unique symbol = Symbol.for("value");
/** Registered cleanup callbacks for disposal. */
const S_DISPOSE: unique symbol = Symbol.for("disposeCallbacks");

/** Type of the context object attached to an Owner. */
type IOwnershipContextRecord = Record<string | symbol, unknown>;

/**
 * Represents a context value that can be attached to an Owner.
 * Contexts support inheritance via prototype chains.
 *
 * @template T - Type of the context value.
 */
type IOwnershipContext<T = any> = {
  /** Unique identifier for this context. */
  readonly id: symbol;
  /** Default value to return if the context is missing in the owner. */
  readonly defaultValue?: T;
};

/**
 * Bitwise flags representing the lifecycle state of an Ownership node.
 * Allows fast checks via bitwise operations.
 */
const enum OwnershipStateFlags {
  /** Node is clean, no pending updates. */
  CLEAN = 0,
  /** Node is scheduled for validation/check. */
  CHECK = 1 << 0,
  /** Node has pending updates (dirty). */
  DIRTY = 1 << 1,
  /** Node is in the process of disposal. */
  DISPOSING = 1 << 2,
  /** Node has been disposed and should not be reused. */
  DISPOSED = 1 << 3,
}

/** Function type for cleanup callbacks or effect disposers. */
type NoneToVoidFn = () => void;

/**
 * Methods shared by all Owner nodes.
 * Placed on prototype for memory efficiency and stable hidden class layout.
 */
interface IOwnershipMethods {
  /**
   * Append a child node to this owner.
   * Updates `_firstChild`, `_lastChild`, `_nextSibling`, and `_childCount`.
   * Initializes child context via prototype inheritance.
   *
   * @param child - Child owner to attach.
   */
  appendChild(child: IOwnership): void;

  /**
   * Optional hook triggered when a scope is mounted.
   *
   * @param scope - The mounted child owner.
   */
  onScopeMount(scope: IOwnership): void;

  /**
   * Register a cleanup callback to be executed during disposal.
   * Callbacks are executed in registration order. Errors are caught and logged.
   *
   * @param fn - Cleanup function.
   */
  onScopeCleanup(fn: NoneToVoidFn): void;

  /**
   * Remove a direct child from this owner.
   *
   * @param child - Child owner to remove.
   */
  removeChild(child: IOwnership): void;

  /**
   * Dispose this node and all descendants.
   * Iteratively traverses children to avoid recursion.
   * Executes cleanup callbacks and clears references.
   */
  dispose(): void;
}

/**
 * Represents a single node in the Ownership tree.
 * Nodes track children, context, state, and disposal callbacks.
 */
interface IOwnership extends IOwnershipMethods {
  /** Parent node in the ownership tree. */
  _parent: IOwnership | undefined;

  /** First child node in the linked list of children. */
  _firstChild: IOwnership | undefined;

  /** Last child node, used for O(1) append. */
  _lastChild: IOwnership | undefined;

  /** Next sibling node in the parent's child list. */
  _nextSibling: IOwnership | undefined;

  /** Prev sibling node in the parent's child list that makes list is linked and remove in O(1). */
  _prevSibling: IOwnership | undefined;

  /** Array of cleanup callbacks registered via `onScopeCleanup`. */
  _disposal: NoneToVoidFn[];

  /** Context object for scoped variables, prototypally inherited from parent. */
  _context: Record<string | symbol, unknown> | undefined;

  /** Bitwise state flags describing the node lifecycle. */
  _state: OwnershipStateFlags;

  /** Number of immediate children attached to this node. */
  _childCount: number;
}

export {
  OwnershipStateFlags,
  S_ID,
  S_OWN,
  S_SOURCES,
  S_SUBS,
  S_DIRTY,
  S_FN,
  S_VALUE,
  S_DISPOSE,
};

export type {
  IOwnership,
  IOwnershipMethods,
  IOwnershipContextRecord,
  IOwnershipContext,
  NoneToVoidFn,
};
