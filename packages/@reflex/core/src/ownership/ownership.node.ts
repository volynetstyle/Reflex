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

import { DISPOSED } from "../graph/graph.constants";
import { CausalCoords } from "../storage/config/CausalCoords";
import {
  createContextLayer,
  contextProvide,
  contextLookup,
  contextHasOwn,
} from "./ownership.context";
import type {
  ContextKeyType,
  IOwnershipContextRecord,
} from "./ownership.contract";

export class OwnershipNode {
  _parent: OwnershipNode | null = null; // invariant
  _firstChild: OwnershipNode | null = null; // invariant
  _lastChild: OwnershipNode | null = null; // optimization
  _nextSibling: OwnershipNode | null = null; // forward-list only

  _context: IOwnershipContextRecord | null = null;
  _cleanups: NoneToVoidFn[] | null = null;

  _childCount = 0;
  _flags = 0;

  _causal: CausalCoords = { t: 0, v: 0, g: 0, s: 0 };
}

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export class OwnershipService {
  createOwner = (parent: OwnershipNode | null = null): OwnershipNode => {
    const node = new OwnershipNode();
    if (parent !== null) this.appendChild(parent, node);
    return node;
  };

  appendChild(parent: OwnershipNode, child: OwnershipNode): void {
    if (parent._flags & DISPOSED) return;

    // detach from old parent (O(n), допустимо)
    const oldParent = child._parent;
    if (oldParent !== null) {
      this.removeChild(oldParent, child);
    }

    child._parent = parent;
    child._nextSibling = null;

    if (parent._lastChild !== null) {
      parent._lastChild._nextSibling = child;
    } else {
      parent._firstChild = child;
    }

    parent._lastChild = child;
    parent._childCount++;
  }

  removeChild = (parent: OwnershipNode, child: OwnershipNode): void => {
    let prev: OwnershipNode | null = null;
    let cur = parent._firstChild;

    while (cur !== null) {
      if (cur === child) {
        const next = cur._nextSibling;

        if (prev !== null) prev._nextSibling = next;
        else parent._firstChild = next;

        if (parent._lastChild === cur) {
          parent._lastChild = prev;
        }

        cur._parent = null;
        cur._nextSibling = null;
        parent._childCount--;
        return;
      }

      prev = cur;
      cur = cur._nextSibling;
    }
  };

  dispose = (root: OwnershipNode): void => {
    if (root._flags & DISPOSED) return;

    const stack: OwnershipNode[] = [];
    let node: OwnershipNode | null = root;

    while (node !== null || stack.length > 0) {
      // спуск вниз
      while (node !== null) {
        stack.push(node);
        node = node._firstChild;
      }

      const current = stack.pop()!;
      const parent = current._parent;

      // cleanups (LIFO per node)
      const cleanups = current._cleanups;
      current._cleanups = null;

      if (cleanups !== null) {
        for (let i = cleanups.length - 1; i >= 0; i--) {
          try {
            cleanups[i]?.();
          } catch (err) {
            console.error("Error during ownership cleanup:", err);
          }
        }
      }

      current._flags = DISPOSED;

      // unlink from parent (O(n), допустимо)
      if (parent !== null) {
        this.removeChild(parent, current);
      }

      // reset node
      current._parent = null;
      current._firstChild = null;
      current._lastChild = null;
      current._nextSibling = null;
      current._context = null;
      current._childCount = 0;

      // переход к sibling через стек
      if (stack.length > 0) {
        const top = stack[stack.length - 1]!;
        node = top._firstChild;
        while (node !== null && node._flags & DISPOSED) {
          node = node._nextSibling;
        }
      } else {
        node = null;
      }
    }
  };

  getContext = (node: OwnershipNode): IOwnershipContextRecord => {
    let ctx = node._context;
    if (ctx !== null) return ctx;

    ctx = createContextLayer(node._parent?._context ?? null);
    node._context = ctx;
    return ctx;
  };

  provide = (
    node: OwnershipNode,
    key: ContextKeyType,
    value: unknown,
  ): void => {
    if (value === node) {
      throw new Error("Cannot provide owner itself");
    }

    if (typeof key === "string" && FORBIDDEN_KEYS.has(key)) {
      throw new Error(`Forbidden context key: ${key}`);
    }

    contextProvide(this.getContext(node), key, value);
  };

  inject = <T>(node: OwnershipNode, key: ContextKeyType): T | undefined => {
    return contextLookup<T>(node, key);
  };

  hasOwn = (node: OwnershipNode, key: ContextKeyType): boolean => {
    const ctx = node._context;
    return ctx !== null && contextHasOwn(ctx, key);
  };

  onScopeCleanup = (node: OwnershipNode, fn: NoneToVoidFn): void => {
    if (node._flags & DISPOSED) return;
    (node._cleanups ??= []).push(fn);
  };
}
