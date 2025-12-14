import { OwnershipNode, OwnershipService } from "./ownership.node";

/**
 * OwnershipScope
 *
 * Maintains the current ownership context (stack-like),
 * without owning lifecycle or disposal responsibilities.
 *
 * Responsibilities:
 *  - track current OwnershipNode
 *  - provide safe withOwner switching
 *  - create scoped owners via OwnershipService
 */
export class OwnershipScope {
  private _current: OwnershipNode | null = null;
  private readonly _service: OwnershipService;

  constructor(service: OwnershipService) {
    this._service = service;
  }

  getOwner(): OwnershipNode | null {
    return this._current;
  }

  withOwner<T>(owner: OwnershipNode, fn: () => T): T {
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
   * - Does NOT auto-dispose the owner
   *   (lifecycle is managed elsewhere)
   */
  createScope<T>(
    fn: () => T,
    parent: OwnershipNode | null = this._current,
  ): T {
    const owner = this._service.createOwner(parent);
    return this.withOwner(owner, fn);
  }
}

/**
 * Factory for creating a new OwnershipScope instance.
 *
 * OwnershipService is injected explicitly to avoid globals
 * and enable deterministic ownership graphs.
 */
export function createOwnershipScope(
  service: OwnershipService,
): OwnershipScope {
  return new OwnershipScope(service);
}

export type { OwnershipScope as OwnershipScopeType };
