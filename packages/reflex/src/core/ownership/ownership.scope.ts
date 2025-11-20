import { createOwner } from "./ownership.core.js";
import { IOwnership } from "./ownership.type.js";

/**
 * OwnershipScope class: maintains the current owner context.
 *
 * Replaces functional createOwnershipScope with a stable class
 * for better inlining and performance.
 *
 * Provides:
 *  - getOwner(): IOwnership | null
 *  - withOwner(owner, fn): T
 *  - createScope(fn, parent?): T
 */
export class OwnershipScope {
  private _current: IOwnership | null = null;

  getOwner(): IOwnership | null {
    return this._current;
  }

  withOwner<T>(owner: IOwnership, fn: () => T): T {
    const prev = this._current;
    this._current = owner;

    try {
      return fn();
    } finally {
      this._current = prev;
    }
  }

  createScope<T>(fn: () => T, parent: IOwnership | null): T {
    const owner = createOwner(parent ?? this._current);
    return this.withOwner(owner, fn);
  }
}

/**
 * Factory for creating a new OwnershipScope instance.
 */
export const createOwnershipScope = (): OwnershipScope => {
  return new OwnershipScope();
};

export type { OwnershipScope as OwnershipScopeType };
