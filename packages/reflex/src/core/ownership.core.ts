/**
 * @file ownership.ts
 * Ownership System
 *
 * A lightweight hierarchical ownership tree for managing resources,
 * contexts, and cleanup callbacks. Inspired by React’s owner model
 * and SolidJS’s Owner. Optimized for V8/JIT performance with stable
 * hidden classes and iterative traversal.
 *
 * Key features:
 * - Owners form a tree with parent-child and sibling links.
 * - Cleanup callbacks are executed during disposal.
 * - Context is inherited via prototype chains for efficient lookups.
 * - Disposal uses stack-based iteration to handle deep trees safely.
 * - Supports nested ownership scopes with automatic restoration.
 * - Idempotent disposal and safe error handling in cleanup.
 *
 * Ownership Tree Example:
 *
 * [Parent Owner] (_state: CLEAN)
 * │
 * ├─ _firstChild → [Child1 Owner] (_state: CLEAN)
 * │                 ├─ _nextSibling → [Child2 Owner] (_state: CLEAN)
 * │                 └─ _firstChild → [Grandchild Owner] (_state: CLEAN)
 * │
 * ├─ _lastChild → [Child2 Owner]
 *
 * Context and cleanup:
 * _context → prototype chain from Parent (Child inherits)
 * _disposal → [array of cleanup functions]
 *
 * Lifecycle Methods:
 * ------------------
 *
 * createOwnershipScope(runtime, fn)
 *   - Creates a new owner node and temporarily sets it as the current runtime owner.
 *   - Saves the previous owner to restore after `fn` executes.
 *   - Allows registration of children and cleanup callbacks within the scope.
 *
 * appendChild(child)
 *   - Adds a child to the owner tree.
 *   - Updates `_firstChild` and `_lastChild` pointers.
 *   - Links siblings via `_nextSibling`.
 *   - Inherits the parent `_context` via prototype delegation.
 *
 * onCleanup(fn)
 *   - Registers a function to be called during disposal.
 *   - Functions are stored in `_disposal` and executed in registration order.
 *   - Errors in callbacks are caught and logged without halting disposal.
 *
 * dispose()
 *   - Iteratively disposes the node and all descendants.
 *   - Traverses the tree using `_firstChild` and `_nextSibling`.
 *   - Collects all nodes in a batch for efficient disposal.
 *   - Executes all cleanup functions while catching errors.
 *   - Clears references: `_firstChild`, `_lastChild`, `_nextSibling`, `_context`.
 *   - Marks `_state` as `DISPOSED` and resets `_childCount` to 0.
 *   - Safe to call multiple times (idempotent).
 *
 * Field Descriptions:
 * -------------------
 * _firstChild: IOwnership | undefined
 *   - Reference to the first child in the ownership tree.
 *
 * _lastChild: IOwnership | undefined
 *   - Reference to the last child in the ownership tree.
 *
 * _nextSibling: IOwnership | undefined
 *   - Reference to the next sibling in the tree.
 *
 * _disposal: Array<() => void>
 *   - Array of cleanup callbacks to run during disposal.
 *
 * _context: any
 *   - Context object inherited via prototype chain.
 *   - Children inherit the parent context, allowing shared state without direct reference.
 *
 * _state: number
 *   - Tracks the lifecycle state (CLEAN, DISPOSED).
 *
 * _childCount: number
 *   - Number of immediate children of this owner node.
 *
 * Notes & Best Practices:
 * -----------------------
 * - Always register cleanup functions using `onCleanup`.
 * - Use `createOwnershipScope` to isolate side effects within a specific owner.
 * - Do not manually modify `_firstChild`, `_nextSibling`, or `_childCount`; use `appendChild`.
 * - Dispose deep trees iteratively to avoid stack overflows.
 * - Errors in cleanup do not prevent other nodes from disposing.
 * - Idempotent disposal ensures safety for repeated calls.
 *
 */

import { ReflexObject } from "./object/inherit";
import { IOwnership, OwnershipStateFlags } from "./ownership.type";

/**
 * Shared prototype for all Owner nodes.
 * Methods are defined here to avoid duplication and maintain a stable V8 hidden class.
 */
const OwnershipPrototype: IOwnership = {
  _firstChild: undefined,
  _lastChild: undefined,
  _nextSibling: undefined,
  _disposal: [],
  _context: undefined,
  _state: OwnershipStateFlags.CLEAN,
  _childCount: 0,

  /**
   * Appends a child Owner to this node.
   * - Updates `_firstChild` and `_lastChild` pointers.
   * - Links the new child via `_nextSibling`.
   * - Inherits context from parent using prototypal delegation.
   * @param child - The child Owner to append.
   */
  appendChild(child: IOwnership) {
    if (!this._firstChild) {
      this._firstChild = this._lastChild = child;
    } else {
      // Safe due to the if-check ensuring _lastChild is set
      this._lastChild!._nextSibling = child;
      this._lastChild = child;
    }

    this._childCount++;
    child._context = ReflexObject.Inherit(this._context ?? null);
  },

  /**
   * Registers a cleanup callback to be executed on disposal.
   * @param fn - The callback function to register.
   */
  onCleanup(fn: NoneToVoidFn) {
    this._disposal.push(fn);
  },

  /**
   * Disposes this node and all descendants.
   * Uses iterative stack traversal to avoid recursion.
   * Collects nodes in a batch and disposes them together for efficiency.
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
 * Disposes a batch of nodes.
 * - Executes all cleanup callbacks.
 * - Clears references to children and siblings.
 * - Marks nodes as disposed and resets child count.
 * - Collects and logs errors from callbacks without interrupting disposal.
 * @param nodes - Array of nodes to dispose.
 */
function disposeBatch(nodes: IOwnership[]) {
  const errors: Error[] = [];

  for (const node of nodes) {
    if (node._disposal) {
      for (const fn of node._disposal) {
        try {
          fn();
        } catch (err) {
          errors.push(err instanceof Error ? err : new Error(String(err)));
        }
      }
      node._disposal = [];
    }

    // Clear references and update state
    node._firstChild = undefined;
    node._lastChild = undefined;
    node._nextSibling = undefined;
    node._context = undefined;
    node._state = OwnershipStateFlags.DISPOSED;
    node._childCount = 0;
  }

  if (errors.length) {
    console.error("[Ownership dispose]: Errors during cleanup", errors);
  }
}

/**
 * Creates a new ownership scope.
 * - Wraps a function with a new Owner node as the current runtime owner.
 * - Restores the previous owner after execution.
 * @param runtime - The runtime context with the current owner.
 * @param fn - The function to execute within the scope.
 * @returns The created Owner node.
 */
function createOwnershipScope(
  runtime: { currentOwner?: IOwnership },
  fn: NoneToVoidFn
): IOwnership {
  const owner: IOwnership = ReflexObject.Inherit(OwnershipPrototype);

  const prev = runtime.currentOwner;
  runtime.currentOwner = owner;

  try {
    fn();
  } finally {
    runtime.currentOwner = prev;
  }

  return owner;
}

export { IOwnership, createOwnershipScope, OwnershipPrototype };
