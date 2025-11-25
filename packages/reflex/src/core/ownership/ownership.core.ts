import { OwnershipNode } from "./ownership.node"
import { IOwnership } from "./ownership.type"

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
