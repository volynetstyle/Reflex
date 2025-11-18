import { CLEAN, IOwnership, S_OWN_BRAND } from "./ownership.type.js";
import OwnershipPrototype from "./ownership.proto.js";

function createOwner(parent?: IOwnership): IOwnership {
  const owner = Object.create(OwnershipPrototype) as IOwnership;

  owner._parent = undefined;

  owner._firstChild = undefined;
  owner._lastChild = undefined;

  owner._nextSibling = undefined;
  owner._prevSibling = undefined;

  owner._disposal = undefined;
  owner._context = undefined;
  owner._queue = undefined;

  owner._epoch = 0;
  owner._contextEpoch = 0;

  owner._state = CLEAN;
  owner._childCount = 0;

  owner[S_OWN_BRAND] = true;

  if (parent) {
    parent.appendChild(owner);
    parent.onScopeMount?.(owner);
  }

  return owner;
}

export { createOwner };
export type { IOwnership };
