import { OwnershipNode } from "./ownership.node.js";
import { IOwnership } from "./ownership.type.js";

/**
 * createOwner: Factory for creating ownership nodes.
 *
 * Creates a new OwnershipNode with all fields initialized.
 * Methods are bound to OwnershipNode.prototype for monomorphic calls.
 * If parent is provided, automatically appends to parent's child list.
 */
function createOwner(parent: IOwnership | null = null): IOwnership {
  const owner = new OwnershipNode();

  if (parent !== null) {
    parent.appendChild(owner);
    parent.onScopeMount?.(owner);
  }

  return owner;
}

export { createOwner };
export type { IOwnership };
