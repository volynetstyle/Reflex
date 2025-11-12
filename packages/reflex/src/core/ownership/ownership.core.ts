import {
  IOwnership,
  OwnershipStateFlags,
  S_OWN_BRAND,
} from "./ownership.type.js";
import OwnershipPrototype from "./ownership.proto.js";
import { newIntrusiveList } from "../collections/intrusive_list.js";

/**
 * Factory for creating a new ownership node.
 * Each owner has its own intrusive list of children and optional parent link.
 *
 * @param {IOwnership} [parent] - Optional parent owner to attach to.
 * @returns {IOwnership} A new ownership node with initialized state.
 */
function createOwner(parent?: IOwnership): IOwnership {
  const owner: IOwnership = Object.assign(
    Object.create(OwnershipPrototype),
    {
      /** parent in the ownership tree */
      _owner: undefined,
      /** intrusive list of child nodes */
      _children: newIntrusiveList<IOwnership>(),
      /** disposal callbacks */
      _disposal: undefined,
      /** contextual data record */
      _context: undefined,
      /** optional async or scheduling queue */
      _queue: undefined,
      /** monotonic epoch counter */
      _epoch: 0,
      /** current state flags */
      _state: OwnershipStateFlags.CLEAN,
      /** brand symbol for runtime identity */
      [S_OWN_BRAND]: true as const,
    }
  );

  if (parent) {
    parent.appendChild(owner);
  }

  return owner;
}

export { OwnershipPrototype, createOwner };
export type { IOwnership };
