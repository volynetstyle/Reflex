import { createOwner } from "./ownership.core";
import { IOwnership } from "./ownership.type";

/**
 * Lightweight ownership context manager.
 *
 * Handles the current ownership scope in a stack-safe way.
 * Provides scoped creation and temporary owner replacement.
 */
export class OwnershipScope {
  private _owner?: IOwnership;

  /**
   * Returns the current owner in the scope.
   * Note: if you get `undefined`, it's probably your root
   */
  get owner(): typeof this._owner {
    return this._owner;
  }

  /**
   * Creates a new ownership context under the current (or given) owner
   * and executes the callback inside that scope.
   */
  createScope<T>(fn: () => T, parent = this.owner): T {
    const owner = createOwner(parent);

    return this.withOwner(owner, fn);
  }

  /**
   * Temporarily replaces current owner during the callback execution.
   */
  withOwner<T>(owner: IOwnership, fn: () => T): T {
    const prev = this._owner;
    this._owner = owner;

    try {
      return fn();
    } finally {
      this._owner = prev;
    }
  }
}
