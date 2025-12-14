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
  _parent: OwnershipNode | null = null;
  _firstChild: OwnershipNode | null = null;
  _lastChild: OwnershipNode | null = null;
  _nextSibling: OwnershipNode | null = null;
  _prevSibling: OwnershipNode | null = null;

  // payload
  _context: IOwnershipContextRecord | null = null;
  _cleanups: NoneToVoidFn[] | null = null;

  // state
  _childCount = 0;
  _flags = 0;

  // flat causal coords (even if unused yet)
  _causal: CausalCoords = {
    t: 0,
    v: 0,
    g: 0,
    s: 0,
  };
}

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export class OwnershipService {
  createOwner = (parent: OwnershipNode | null = null): OwnershipNode => {
    const node = new OwnershipNode();
    if (parent !== null) this.appendChild(parent, node);
    return node;
  };

  appendChild = (parent: OwnershipNode, child: OwnershipNode): void => {
    if (parent._flags & DISPOSED) return;

    // SAFE reparent
    const oldParent = child._parent;
    if (oldParent !== null) {
      this.removeChild(oldParent, child);
    }

    child._parent = parent;
    child._prevSibling = parent._lastChild;
    child._nextSibling = null;

    if (parent._lastChild !== null) {
      parent._lastChild._nextSibling = child;
    } else {
      parent._firstChild = child;
    }

    parent._lastChild = child;
    parent._childCount++;
  };

  removeChild = (parent: OwnershipNode, child: OwnershipNode): void => {
    if (child._parent !== parent) return;
    if (parent._flags & DISPOSED) return;

    const prev = child._prevSibling;
    const next = child._nextSibling;

    if (prev !== null) prev._nextSibling = next;
    else parent._firstChild = next;

    if (next !== null) next._prevSibling = prev;
    else parent._lastChild = prev;

    child._parent = null;
    child._prevSibling = null;
    child._nextSibling = null;

    parent._childCount--;
  };

  dispose = (root: OwnershipNode): void => {
    if (root._flags & DISPOSED) return;

    let node: OwnershipNode | null = root;

    while (node !== null) {
      const last: OwnershipNode | null = node._lastChild;

      if (last !== null && !(last._flags & DISPOSED)) {
        node = last;
        continue;
      }

      const parent: OwnershipNode | null = node._parent;

      // run cleanups (LIFO)
      const cleanups = node._cleanups;
      node._cleanups = null;

      if (cleanups !== null) {
        for (let i = cleanups.length - 1; i >= 0; i--) {
          try {
            cleanups[i]?.();
          } catch (err) {
            console.error("Error during ownership cleanup:", err);
          }
        }
      }

      node._flags = DISPOSED;

      if (parent !== null) {
        const prev = node._prevSibling;
        const next = node._nextSibling;

        if (prev !== null) prev._nextSibling = next;
        else parent._firstChild = next;

        if (next !== null) next._prevSibling = prev;
        else parent._lastChild = prev;

        parent._childCount--;
      }

      // reset node
      node._parent = null;
      node._firstChild = null;
      node._lastChild = null;
      node._nextSibling = null;
      node._prevSibling = null;
      node._context = null;
      node._childCount = 0;

      node = parent;
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

    let arr = node._cleanups;
    if (arr === null) {
      arr = [];
      node._cleanups = arr;
    }
    arr.push(fn);
  };
}
