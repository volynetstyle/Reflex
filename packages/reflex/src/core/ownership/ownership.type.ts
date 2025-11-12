/**
 * @file ownership.type.ts
 * Core types, symbols, and flags for Reflex Ownership System.
 * Defines hierarchical scopes, context inheritance, and cleanup logic.
 */

import { IntrusiveList, IntrusiveListNode } from "../collections/intrusive_list.js";

const S_OWN_BRAND = Symbol("OwnershipBrand");
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


/** Unified ownership node */
interface IOwnership extends IntrusiveListNode<IOwnership> {
  /** parent owner */
  _owner?: IOwnership;
  /** owned children (intrusive list) */
  _children: IntrusiveList<IOwnership>;
  /** cleanup callbacks */
  _disposal?: NoneToVoidFn[];
  /** contextual data */
  _context?: IOwnershipContextRecord;
  /** monotonic epoch counter */
  _epoch: number;
  /** bitflag state */
  _state: OwnershipStateFlags;

  // Methods:
  appendChild(child: IOwnership): void;
  removeChild(child: IOwnership): void;

  onScopeMount(child: IOwnership): void;
  onScopeCleanup(fn: NoneToVoidFn): void;

  getContext(): IOwnershipContextRecord;
  provide(key: symbol | string, value: unknown): void;
  inject<T>(key: symbol | string): T | undefined;
  hasOwn(key: symbol | string): boolean;
  dispose(trategy?: DisposalStrategy): void;

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
  IOwnershipContext,
  IOwnershipContextRecord,
};
