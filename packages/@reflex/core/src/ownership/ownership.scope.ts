import { OwnershipNode } from "./ownership.node";
import { appendChild } from "./ownership.tree";

/**
 * OwnershipScope
 *
 * Maintains current ownership context (stack-like),
 * without owning lifecycle/disposal responsibilities.
 */
export class OwnershipScope {
  private _current: OwnershipNode | null = null;

  getOwner(): OwnershipNode | null {
    return this._current;
  }

  withOwner<T>(owner: OwnershipNode | null, fn: () => T): T {
    const prev = this._current;
    this._current = owner;

    try {
      return fn();
    } finally {
      this._current = prev;
    }
  }
  /**
   * Create a new ownership scope.
   *
   * - Parent defaults to current owner
   * - Does NOT auto-dispose owner
   */
  createScope<T>(fn: () => T, parent: OwnershipNode | null = this._current): T {
    const node = new OwnershipNode();

    return this.withOwner((parent && appendChild(parent, node), node), fn);
  }
}

export function createOwnershipScope(): OwnershipScope {
  return new OwnershipScope();
}

export type { OwnershipScope as OwnershipScopeType };
