import { createOwner } from "./ownership.core";
import { IOwnership } from "./ownership.type";

/**
 * Lightweight ownership scope manager
 */
export class OwnershipScope {
  private _owner?: IOwnership;

  get owner(): IOwnership | undefined {
    return this._owner;
  }

  run<T>(owner: IOwnership, fn: () => T): T {
    const prev = this._owner;
    this._owner = owner;

    try {
      return fn();
    } finally {
      this._owner = prev;
    }
  }

  createScope<T>(fn: () => T, parent?: IOwnership): T {
    const owner = createOwner(parent ?? this._owner);

    return this.run(owner, fn);
  }

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
