import { createOwner } from "./ownership.core";
import {
  createContext,
  getContext,
  hasContext,
  setContext,
} from "./ownership.context";
import { IOwnership, IOwnershipContext } from "./ownership.type";

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

  create<T>(fn: () => T, parent?: IOwnership): T {
    const owner = createOwner(parent ?? this._owner);
    
    return this.run(owner, fn);
  }
}
