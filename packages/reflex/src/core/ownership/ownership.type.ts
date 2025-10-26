/**
 * @file ownership.type.ts
 * Core types, symbols, and flags for Reflex Ownership System.
 * Defines hierarchical scopes, context inheritance, and cleanup logic.
 */

const S_ID = Symbol.for("id"); // Unique internal ID
const S_OWN = Symbol.for("ownership"); // Parent Owner reference
const S_SOURCES = Symbol.for("sources"); // Reactive dependencies
const S_SUBS = Symbol.for("subscribers"); // Reactive dependents
const S_DIRTY = Symbol.for("dirty"); // Marks node as dirty
const S_FN = Symbol.for("fn"); // Computation function
const S_VALUE = Symbol.for("value"); // Current value
const S_DISPOSE = Symbol.for("disposeCallbacks"); // Cleanup list

type IOwnershipContextRecord = Record<string | symbol, unknown>;

/** Defines a context entry with inheritance support. */
type IOwnershipContext<T = unknown> = {
  id: symbol;
  defaultValue?: T;
};

/** Bitwise node state — used for fast lifecycle checks. */
const enum OwnershipStateFlags {
  CLEAN = 0,
  CHECK = 1 << 0,
  DIRTY = 1 << 1,
  DISPOSING = 1 << 2,
  DISPOSED = 1 << 3,
}

/** Cleanup callback type. */
type NoneToVoidFn = () => void;

/** Common API for all Ownership nodes. */
interface IOwnershipMethods {
  /** Attach a child to this owner (updates tree links & context). */
  appendChild(child: IOwnership): void;

  /** Triggered when a new child scope is mounted. */
  onScopeMount(scope: IOwnership): void;

  /** Register a cleanup callback (runs on dispose). */
  onScopeCleanup(fn: NoneToVoidFn): void;

  /** Detach a direct child from this owner. */
  removeChild(child: IOwnership): void;

  /** Get or create the current scope context. */
  getContext(): IOwnershipContextRecord;

  /** Provide a new key/value in this scope’s context. */
  provide(key: symbol | string, value: unknown): void;

  /** Retrieve a value from nearest context scope. */
  inject<T>(key: symbol | string): T | undefined;

  /** Dispose this owner and all descendants (iterative). */
  dispose(): void;
}

/** A single node in the Ownership tree. */
interface IOwnership extends IOwnershipMethods {
  _parent?: IOwnership;
  _firstChild?: IOwnership;
  _lastChild?: IOwnership;
  _nextSibling?: IOwnership;
  _prevSibling?: IOwnership;
  _disposal?: NoneToVoidFn[];
  _context?: IOwnershipContextRecord;
  _queue?: any;
  _state: OwnershipStateFlags;
  _childCount: number;
}

export {
  S_ID,
  S_OWN,
  S_SOURCES,
  S_SUBS,
  S_DIRTY,
  S_FN,
  S_VALUE,
  S_DISPOSE,
  OwnershipStateFlags,
};

export type {
  IOwnership,
  IOwnershipMethods,
  IOwnershipContext,
  IOwnershipContextRecord,
  NoneToVoidFn,
};
