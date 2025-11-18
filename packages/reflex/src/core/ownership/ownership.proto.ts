import { ReflexObject } from "../object/object.inherit.js";
import OwnershipDisposeError from "./ownership.error.js";
import {
  IOwnership,
  IOwnershipContextRecord,
  IOwnershipMethods,
  type ContextKeyType,
  DisposalStrategy,
  DISPOSED,
  DISPOSING,
} from "./ownership.type.js";

const DISPOSAL_INITIAL_CAPACITY = 4 as const;

const OwnershipPrototype = {
  appendChild(this: IOwnership, child: IOwnership) {
    child._parent = this;
    child._prevSibling = this._lastChild;
    child._nextSibling = undefined;

    if (this._lastChild !== undefined) {
      this._lastChild._nextSibling = child;
      this._lastChild = child;
    } else {
      this._firstChild = this._lastChild = child;
    }

    const parentContext = this._context;
    if (parentContext !== undefined) {
      child._context =
        ReflexObject.Inherit<IOwnershipContextRecord>(parentContext);
    }

    ++this._childCount;
  },

  removeChild(this: IOwnership, child: IOwnership) {
    if (child._parent !== this) return;

    const prev = child._prevSibling;
    const next = child._nextSibling;

    if (prev !== undefined) prev._nextSibling = next;
    if (next !== undefined) next._prevSibling = prev;

    if (this._firstChild === child) this._firstChild = next;
    if (this._lastChild === child) this._lastChild = prev;

    child._parent = child._prevSibling = child._nextSibling = undefined;
    --this._childCount;
  },

  onScopeCleanup(this: IOwnership, fn: NoneToVoidFn) {
    if (this._state & DISPOSED)
      throw new OwnershipDisposeError(["Cannot add cleanup to disposed owner"]);

    if (!this._disposal) {
      this._disposal = [];
    }

    this._disposal.push(fn);
  },

  dispose(this: IOwnership, strategy?: DisposalStrategy) {
    const { beforeDispose, afterDispose, onError } = strategy ?? {};

    if (this._state & DISPOSED) return;

    beforeDispose?.([this]);

    const stack: IOwnership[] = [this];
    const out: IOwnership[] = [];

    while (stack.length) {
      const node = stack.pop()!;
      if (!node || node._state & DISPOSED) continue;

      out.push(node);

      let child = node._firstChild;
      while (child) {
        if (!(child._state & DISPOSED)) stack.push(child);
        child = child._nextSibling!;
      }
    }

    let errorCount = 0;
    let firstError: unknown;

    for (let i = out.length - 1; i >= 0; i--) {
      const node = out[i]!;
      if (!node || node._state & DISPOSED) continue;

      node._state |= DISPOSING;

      const disposal = node._disposal;
      node._disposal = undefined;

      try {
        if (disposal) {
          for (let j = disposal.length - 1; j >= 0; j--) {
            const fn = disposal[j];
            if (!fn) continue;
            try {
              fn();
            } catch (err) {
              if (!firstError) firstError = err;
              errorCount++;
              onError?.(err, node);
            }
          }
        }
      } finally {
        if (node._prevSibling)
          node._prevSibling._nextSibling = node._nextSibling;
        if (node._nextSibling)
          node._nextSibling._prevSibling = node._prevSibling;

        if (node._parent) {
          if (node._parent._firstChild === node)
            node._parent._firstChild = node._nextSibling;
          if (node._parent._lastChild === node)
            node._parent._lastChild = node._prevSibling;
        }

        node._firstChild =
          node._lastChild =
          node._nextSibling =
          node._prevSibling =
          node._parent =
          node._queue =
          node._context =
            undefined;

        node._childCount = 0;
        node._state = DISPOSED;
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
  },

  /** Retrieve or lazily initialize current context */
  getContext(this: IOwnership): IOwnershipContextRecord {
    if (this._context) return this._context;

    const parentCtx = this._parent?._context;
    const ctx = parentCtx ? Object.create(parentCtx) : Object.create(null);

    this._context = ctx;
    return ctx;
  },

  /** Provide new key/value pair */
  provide(this: IOwnership, key: ContextKeyType, value: unknown): void {
    if (value === this) {
      throw new Error("Cannot provide owner itself into context");
    }
    const ctx = this.getContext();
    ctx[key] = value;
  },

  /** Lookup contextual value */
  inject<T>(this: IOwnership, key: ContextKeyType): T | undefined {
    return this._context?.[key] as T | undefined;
  },

  /** Check for local context key */
  hasOwn(this: IOwnership, key: ContextKeyType): boolean {
    return this._context !== undefined && Object.hasOwn(this._context, key);
  },
} satisfies IOwnershipMethods;

export default OwnershipPrototype;
