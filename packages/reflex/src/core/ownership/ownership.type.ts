/**
 * @file ownership.type.ts
 * Core types and flags for Reflex Ownership System.
 */
import { OwnershipNode } from "./ownership.node.js";

const S_OWN_BRAND = Symbol("OwnershipBrand");
const S_ID = Symbol.for("ownership:id");
const S_OWN = Symbol.for("ownership:parent");
const S_SOURCES = Symbol.for("ownership:sources");
const S_SUBS = Symbol.for("ownership:subscribers");
const S_DIRTY = Symbol.for("ownership:dirty");
const S_FN = Symbol.for("ownership:fn");
const S_VALUE = Symbol.for("ownership:value");
const S_DISPOSE = Symbol.for("ownership:dispose");

type ContextKeyType = string;

interface IOwnershipContextRecord {
  [key: ContextKeyType]: unknown;
}

interface IOwnershipContext<T = unknown> {
  readonly id: symbol;
  readonly defaultValue?: T;
}

const CLEAN = 0;
const CHECK = 1 << 0;
const DIRTY = 1 << 1;
const DISPOSING = 1 << 2;
const DISPOSED = 1 << 3;

interface IOwnershipMethods {
  appendChild(child: IOwnership): void;
  onScopeMount?(scope: IOwnership): void;
  onScopeCleanup(fn: NoneToVoidFn): void;
  removeChild(child: IOwnership): void;
  getContext(): IOwnershipContextRecord;
  provide(key: symbol | string, value: unknown): void;
  inject<T>(key: symbol | string): T | undefined;
  hasOwn(key: symbol | string): boolean;
  dispose(strategy?: DisposalStrategy): void;
}

type IOwnership = OwnershipNode & IOwnershipMethods;

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
  CLEAN,
  CHECK,
  DIRTY,
  DISPOSING,
  DISPOSED,
};

export type {
  IOwnership,
  IOwnershipMethods,
  ContextKeyType,
  IOwnershipContext,
  IOwnershipContextRecord,
};
