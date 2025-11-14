import {
  CLEAN,
  IOwnership,
  S_OWN_BRAND,
} from "./ownership.type.js";
import OwnershipPrototype from "./ownership.proto.js";

function createOwner(parent?: IOwnership, skipAppend = false): IOwnership {
  const owner: IOwnership = {
    ...OwnershipPrototype,

    _parent: undefined,
    _firstChild: undefined,
    _lastChild: undefined,
    _nextSibling: undefined,
    _prevSibling: undefined,
    _disposal: undefined,
    _context: undefined,
    _queue: undefined,
    
    _epoch: 0,
    _contextEpoch: 0,

    _state: CLEAN,
    _childCount: 0,

    [S_OWN_BRAND]: true,
  };

  if (!skipAppend && parent) {
    parent.appendChild(owner);
    parent?.onScopeMount?.(owner);
  }

  return owner;
}

export { OwnershipPrototype, createOwner };
export type { IOwnership };
