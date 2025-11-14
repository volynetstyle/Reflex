import { createOwner } from "./ownership.core.js";
import { IOwnership } from "./ownership.type.js";

/**
 * OwnershipScope — functional, zero-class manager
 * for maintaining the current owner context.
 *
 * Provides:
 *  - getOwner(): IOwnership | undefined
 *  - withOwner(owner, fn): T
 *  - createScope(fn, parent?): T
 *
 * Works like a stack-safe ownership context.
 */
export const createOwnershipScope = () => {
  let currentOwner: IOwnership | undefined;

  const getOwner = () => {
    return currentOwner;
  };

  function withOwner<T>(owner: IOwnership, fn: () => T): T {
    const prev = currentOwner;
    currentOwner = owner;

    const out = fn();

    currentOwner = prev;
    return out;
  }

  const createScope = <T>(fn: () => T, skipAppend = false): T => {
    const owner = createOwner(currentOwner, skipAppend);

    const prev = currentOwner;
    currentOwner = owner;

    const out = fn();

    currentOwner = prev;
    return out;
  };

  return { getOwner, withOwner, createScope };
};

export type OwnershipScope = ReturnType<typeof createOwnershipScope>;
