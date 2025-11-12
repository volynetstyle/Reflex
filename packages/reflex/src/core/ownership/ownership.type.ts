/**
 * @file ownership.type.ts
 * Core types, symbols, and flags for Reflex Ownership System.
 * Defines hierarchical scopes, context inheritance, and cleanup logic.
 */

const S_OWN_BRAND= Symbol("OwnershipBrand");
const S_ID = Symbol.for("ownership:id");
const S_OWN = Symbol.for("ownership:parent");
const S_SOURCES = Symbol.for("ownership:sources");
const S_SUBS = Symbol.for("ownership:subscribers");
const S_DIRTY = Symbol.for("ownership:dirty");
const S_FN = Symbol.for("ownership:fn");
const S_VALUE = Symbol.for("ownership:value");
const S_DISPOSE = Symbol.for("ownership:dispose");


interface IOwnershipContextRecord {
  [key: string | symbol]: unknown;
}

interface IOwnershipContext<T = unknown> {
  readonly id: symbol;
  readonly defaultValue?: T;
}

const OwnershipStateFlags = {
  CLEAN: 0,
  CHECK: 1 << 0,
  DIRTY: 1 << 1,
  DISPOSING: 1 << 2,
  DISPOSED: 1 << 3,
} as const;

type OwnershipStateFlags =
  (typeof OwnershipStateFlags)[keyof typeof OwnershipStateFlags];


interface IOwnershipMethods {
  /** Attach a child to this owner (updates tree links & context). */
  appendChild(child: IOwnership): void;

  /** Triggered when a new child scope is mounted. */
  onScopeMount?(scope: IOwnership): void;

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

  /** Check if a context value exists locally (not inherited). */
  hasOwn(key: symbol | string): boolean;

  /** Dispose this owner and all descendants (iterative). */
  dispose(strategy?: DisposalStrategy): void;
}

interface IOwnershipInternal {
  _parent: IOwnership | undefined;
  _firstChild: IOwnership | undefined;
  _lastChild: IOwnership | undefined;
  _nextSibling: IOwnership | undefined;
  _prevSibling: IOwnership | undefined;
  _disposal: NoneToVoidFn[] | undefined;
  _context: IOwnershipContextRecord | undefined;
  _queue: unknown | undefined;
  _epoch: number;
  _state: OwnershipStateFlags;
  _childCount: number;
}

interface IOwnership extends IOwnershipInternal, IOwnershipMethods {
  [S_OWN_BRAND]: true;
}

export interface DisposalStrategy {
  onError?: (err: unknown, node: IOwnership) => void;
  beforeDispose?: (nodes: IOwnership[]) => void;
  afterDispose?: (nodes: IOwnership[], errors: number) => void;
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
  S_OWN_BRAND,
  OwnershipStateFlags,
};

export type {
  IOwnership,
  IOwnershipInternal,
  IOwnershipMethods,
  IOwnershipContext,
  IOwnershipContextRecord,
};
