/**
 * @module OwnershipPrototype
 *
 * High-performance ownership graph prototype.
 * Each node represents an isolated ownership scope (like SolidJS “owner”),
 * maintaining deterministic parent/child relationships and scoped context propagation.
 *
 * The design prioritizes:
 *  - predictable memory layout,
 *  - explicit cleanup via `dispose`,
 *  - deterministic finalization order (DFS post-order),
 *  - and minimized dynamic shape mutation for JIT friendliness.
 */

import { ReflexObject } from "../object/object.inherit.js";
import { Bitwise } from "../object/utils/bitwise.js";
import OwnershipDisposeError from "./ownership.error.js";
import {
  IOwnership,
  IOwnershipContextRecord,
  OwnershipStateFlags,
  DisposalStrategy,
} from "./ownership.type.js";

/** Initial pre-allocated cleanup buffer size (minimizes first array resize). */
const DISPOSAL_INITIAL_CAPACITY = 4 as const;

/**
 * Core ownership prototype — defines the behavioral layer for every ownership node.
 *
 * @implements {IOwnershipMethods}
 */
const OwnershipPrototype = {
  /** Attach child node and inherit context */
  appendChild(this: IOwnership, child: IOwnership): void {
    if (child === this) throw new Error("Cannot append owner to itself");
    if (child._owner === this) return;
    if (Bitwise.has(this._state, OwnershipStateFlags.DISPOSED))
      throw new OwnershipDisposeError(["Cannot attach to disposed owner"]);

    // Detach from previous owner if necessary
    if (child._owner && child._owner !== this) {
      child._owner.removeChild(child);
    }

    child._owner = this;
    this._children.push(child);

    if (this._context) {
      child._context = ReflexObject.Inherit<IOwnershipContextRecord>(this._context);
    }

    this.onScopeMount?.(child);
  },

  /** Detach a direct child */
  removeChild(this: IOwnership, child: IOwnership): void {
    if (child._owner !== this) return;
    this._children.remove(child);
    child._owner = undefined;
  },

  /** Register cleanup callback */
  onScopeCleanup(this: IOwnership, fn: () => void): void {
    if (Bitwise.has(this._state, OwnershipStateFlags.DISPOSED)) {
      throw new OwnershipDisposeError(["Cannot add cleanup to disposed owner"]);
    }

    const disposal = this._disposal ?? (this._disposal = []);
    disposal.push(fn);
  },

  /** Dispose ownership tree (DFS post-order) */
  dispose(this: IOwnership, strategy?: DisposalStrategy): void {
    if (Bitwise.has(this._state, OwnershipStateFlags.DISPOSED)) return;

    const { beforeDispose, afterDispose, onError } = strategy ?? {};
    beforeDispose?.([this]);

    let errorCount = 0;
    let firstError: unknown;
    const stack: [IOwnership, boolean][] = [[this, false]];
    const disposeList: IOwnership[] = [];

    // --- Collect post-order (DFS) ---
    while (stack.length) {
      const [node, visited] = stack.pop()!;
      if (visited) {
        disposeList.push(node);
        continue;
      }
      stack.push([node, true]);

      const children: IOwnership[] = [];
      node._children?.forEach(c => children.push(c));
      // reverse order so left-to-right DFS is preserved
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (!Bitwise.has(child._state, OwnershipStateFlags.DISPOSED)) {
          stack.push([child, false]);
        }
      }
    }

    // --- Dispose bottom-up (DFS post-order) ---
    for (let i = 0; i < disposeList.length; i++) {
      const node = disposeList[i]!;
      if (Bitwise.has(node._state, OwnershipStateFlags.DISPOSED)) continue;

      node._state = Bitwise.set(node._state, OwnershipStateFlags.DISPOSING);

      const disposal = node._disposal;
      if (disposal) {
        for (let j = disposal.length - 1; j >= 0; j--) {
          try {
            disposal[j]!();
          } catch (err) {
            if (!firstError) firstError = err;
            errorCount++;
            onError?.(err, node);
          }
        }
      }

      node._disposal = undefined;
      node._context = undefined;
      node._state = OwnershipStateFlags.DISPOSED;

      if (node._children && node._children.size() > 0) {
        node._children.clear();
      }
    }

    afterDispose?.([this], errorCount);

    if (errorCount > 0 && !onError) {
      console.error(
        errorCount === 1
          ? "Error during ownership dispose:"
          : `${errorCount} errors during ownership dispose. First error:`,
        firstError
      );
    }
  },

  /** Retrieve or lazily initialize current context */
  getContext(this: IOwnership): IOwnershipContextRecord {
    if (this._context) return this._context;


    const parentCtx = this._owner?._context;
    const ctx = parentCtx
      ? Object.create(parentCtx)
      : Object.create(null);

    this._context = ctx;
    return ctx;
  },

  /** Provide new key/value pair */
  provide(this: IOwnership, key: symbol | string, value: unknown): void {
    if (value === this)
      throw new Error("Cannot provide owner itself in context");
    const ctx = this.getContext();
    ctx[key] = value;
  },

  /** Lookup contextual value */
  inject<T>(this: IOwnership, key: symbol | string): T | undefined {
    return this._context?.[key] as T | undefined;
  },

  /** Check for local context key */
  hasOwn(this: IOwnership, key: symbol | string): boolean {
    return this._context !== undefined && Object.hasOwn(this._context, key);
  },
};

export default OwnershipPrototype;
