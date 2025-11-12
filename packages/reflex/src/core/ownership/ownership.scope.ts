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

  const withOwner = <T>(owner: IOwnership, fn: () => T): T => {
    const prev = currentOwner;
    currentOwner = owner;

    try {
      return fn();
    } finally {
      currentOwner = prev;
    }
  };

  const createScope = <T>(fn: () => T): T => {
    const parent = currentOwner;
    const owner = createOwner(parent);
    return withOwner(owner, fn);
  };

  return { getOwner, withOwner, createScope };
};

export type OwnershipScope = ReturnType<typeof createOwnershipScope>;
