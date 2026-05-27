import {
  createOwnerContext,
  getActiveOwnerContext,
  type OwnerContext,
} from "../ownership/ownership.scope";

export function getHookOwner(): OwnerContext {
  return getActiveOwnerContext() ?? createOwnerContext();
}
