import { ReflexObject } from "../object/object.inherit.js";
import { Bitwise } from "../object/utils/bitwise.js";
import OwnershipDisposeError from "./ownership.error.js";
import {
  IOwnership,
  OwnershipStateFlags,
  IOwnershipContextRecord,
  IOwnershipMethods,
  DisposalStrategy,
} from "./ownership.type.js";

const DISPOSAL_INITIAL_CAPACITY = 4 as const;

const OwnershipPrototype = {
  appendChild(this: IOwnership, child: IOwnership) {


    if (!child || child._parent === this) return;
    if (child === this) throw new Error("Cannot append owner to itself");
    if (child._state & OwnershipStateFlags.DISPOSED)
      throw new Error("Cannot append a disposed child");

    if (
      this._state &
      (OwnershipStateFlags.DISPOSING | OwnershipStateFlags.DISPOSED)
    )
      throw new Error("Cannot append child to a disposing/disposed owner");

    if (child._parent && child._parent !== this) {
      child._parent.removeChild(child);
    }

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

    this._childCount++;
  },

  removeChild(this: IOwnership, child: IOwnership) {
    if (child._parent !== this) return;

    const prev = child._prevSibling;
    const next = child._nextSibling;

    if (prev) prev._nextSibling = next;
    if (next) next._prevSibling = prev;

    if (this._firstChild === child) this._firstChild = next;
    if (this._lastChild === child) this._lastChild = prev;

    child._parent = child._prevSibling = child._nextSibling = undefined;
    this._childCount--;
  },

  onScopeCleanup(this: IOwnership, fn: NoneToVoidFn) {
    if (this._state & OwnershipStateFlags.DISPOSED)
      throw new OwnershipDisposeError(["Cannot add cleanup to disposed owner"]);

    if (!this._disposal) {
      this._disposal = new Array<NoneToVoidFn>(DISPOSAL_INITIAL_CAPACITY);
      this._disposal.length = 0;
    }
    this._disposal.push(fn);
  },

  dispose(this: IOwnership, strategy?: DisposalStrategy) {
    if (Bitwise.has(this._state, OwnershipStateFlags.DISPOSED)) return;
    const { beforeDispose, afterDispose, onError } = strategy ?? {};
    beforeDispose?.([this]);

    let errorCount = 0;
    let firstError: unknown;

    const stack: Array<[IOwnership, boolean]> = [[this, false]];

    while (stack.length) {
      const [node, visited] = stack.pop()!;

      if (Bitwise.has(node._state, OwnershipStateFlags.DISPOSED)) continue;

      if (!visited) {
        stack.push([node, true]);
        let child = node._lastChild;

        while (child) {
          if (!Bitwise.has(child._state, OwnershipStateFlags.DISPOSED)) {
            stack.push([child, false]);
          }
          child = child._prevSibling;
        }
        continue;
      }

      node._state = Bitwise.set(node._state, OwnershipStateFlags.DISPOSING);

      const disposal = node._disposal;
      if (disposal) {
        for (let j = disposal.length - 1; j >= 0; j--) {
          try { disposal[j]!(); }
          catch (err) {
            if (!firstError) firstError = err;
            errorCount++;
            onError?.(err, node);
          }
        }
      }

      node._firstChild =
        node._lastChild =
        node._nextSibling =
        node._prevSibling =
        node._parent =
        node._context =
        node._disposal =
        undefined;

      node._childCount = 0;
      node._state = OwnershipStateFlags.DISPOSED;
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


    const parentCtx = this._parent?._context;
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
} satisfies IOwnershipMethods;

export default OwnershipPrototype;