import {
  createOwnerContext,
  type OwnerContext,
} from "../ownership/ownership.scope";

const defaultHookOwner = createOwnerContext();

export function getHookOwner(): OwnerContext {
  return defaultHookOwner;
}
