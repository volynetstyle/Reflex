import { ReflexObject } from "../object/inherit";

/**
 * @file ownership.ts
 * Ownership System
 *
 * This module implements a lightweight hierarchical ownership tree
 * (similar to React’s "owner" or SolidJS’s "Owner") for tracking resources,
 * contexts, and cleanup callbacks.
 *
 * The core idea:
 * - Each `Owner` node may have children.
 * - Nodes can register cleanup callbacks that will be executed when disposed.
 * - Disposal propagates to all children in a non-recursive, stack-based traversal.
 * - Context is inherited via prototype chains for cheap lookups without cloning.
 *
 * Memory layout and iteration strategies are tuned for V8/JIT performance.
 */

/**
 * Internal state flags for an Ownership node.
 * Uses bitwise flags for fast checks.
 */
const enum OwnershipStateFlags {
  CLEAN = 0,
  CHECK = 1 << 0,
  DIRTY = 1 << 1,
  DISPOSED = 1 << 2,
}

type NoneToVoidFunction = () => void;

/**
 * IOwnership describes the runtime shape of an Owner node.
 *
 * Note: All fields are optional on the interface level
 * to support prototypal inheritance, but in practice
 * the prototype initializes everything to `undefined` for stable object shapes.
 */
interface IOwnership {
  _firstChild?: IOwnership;
  _lastChild?: IOwnership;
  _nextSibling?: IOwnership;

  _disposal?: NoneToVoidFunction[];
  _context?: Record<string | symbol, any>;
  _useGlobalQueue: boolean;
  _state: OwnershipStateFlags;
  _childCount: number;

  appendChild(child: IOwnership): void;
  onCleanup(fn: NoneToVoidFunction): void;
  dispose(): void;
}

/**
 * Shared prototype for all Owner nodes.
 *
 * Using a prototype object keeps memory lean (methods are not duplicated per instance).
 * All fields are initialized with `undefined` for a stable hidden class in V8.
 */
const OwnershipPrototype: IOwnership = {
  _firstChild: undefined,
  _lastChild: undefined,
  _nextSibling: undefined,
  _disposal: undefined,
  _context: undefined,
  _useGlobalQueue: true,
  _state: OwnershipStateFlags.CLEAN,
  _childCount: 0,

  /**
   * Append a child Owner to this node.
   * - Updates `_firstChild` and `_lastChild` pointers.
   * - Links the new child via `_nextSibling`.
   * - Inherits context from parent using prototypal delegation.
   */
  appendChild(child: IOwnership) {
    if (!this._firstChild) {
      this._firstChild = this._lastChild = child;
    } else {
      this._lastChild!._nextSibling = child;
      this._lastChild = child;
    }

    this._childCount++;
    child._context = ReflexObject.Inherit(this._context ?? null);
  },

  /**
   * Register a cleanup callback for this node.
   * Callbacks are executed on `dispose()`.
   */
  onCleanup(fn: NoneToVoidFunction) {
    (this._disposal ??= []).push(fn);
  },

  /**
   * Dispose this node and all of its descendants.
   *
   * Iterative stack traversal avoids recursion (safe for deep trees).
   * Collected nodes are batched and disposed together for performance.
   */
  dispose() {
    if (this._state & OwnershipStateFlags.DISPOSED) return;

    const stack: IOwnership[] = [];
    const batch: IOwnership[] = [];

    if (this._firstChild) stack.push(this._firstChild);

    while (stack.length) {
      const node = stack.pop()!;

      if (node._firstChild) stack.push(node._firstChild);
      if (node._nextSibling) stack.push(node._nextSibling);

      batch.push(node);
    }

    batch.push(this);

    disposeBatch(batch);
  },
};

/**
 * Dispose a batch of nodes in-place.
 * - Executes all cleanup callbacks.
 * - Clears references to children and siblings.
 * - Marks node as disposed.
 */
function disposeBatch(nodes: IOwnership[]) {
  for (const node of nodes) {
    if (node._disposal) {
      for (const fn of node._disposal) {
        try {
          fn(); // execute cleanup
        } catch (err) {
          console.error("[Ownership dispose]: callback error", err);
        }
      }
      node._disposal = undefined;
    }

    // clear references
    node._firstChild = node._lastChild = node._nextSibling = undefined;
    node._context = undefined;
    node._state = OwnershipStateFlags.DISPOSED;
    node._childCount = 0;
  }
}


/**
 * Resolve which queue to use for a given node.
 *
 * Strategy:
 * - If node is marked with `_useGlobalQueue`, return `globalQueue`.
 * - Otherwise, walk up to the first child to inherit a queue,
 *   falling back to `localQueue` if no parent provides one.
 */
function resolveQueue(node: IOwnership, globalQueue: any, localQueue: any) {
  if (node._useGlobalQueue) {
    return globalQueue;
  }

  if (node._firstChild) {
    return resolveQueue(node._firstChild, globalQueue, localQueue);
  }

  return localQueue;
}

/**
 * Create a new ownership scope.
 *
 * - Wraps a function `fn` with a new Owner node as the current runtime owner.
 * - Ensures `runtime.currentOwner` is restored after execution.
 * - Returns the created Owner node for further manipulation.
 */
function createOwnershipScope(
  runtime: { currentOwner?: IOwnership },
  fn: () => void,
  useGlobalQueue = true
): IOwnership {
  const owner: IOwnership = ReflexObject.Inherit(OwnershipPrototype);
  owner._useGlobalQueue = useGlobalQueue;

  const prev = runtime.currentOwner;
  runtime.currentOwner = owner;

  try {
    fn();
  } finally {
    runtime.currentOwner = prev;
  }

  return owner;
}

export { IOwnership, createOwnershipScope, resolveQueue, OwnershipPrototype };
  