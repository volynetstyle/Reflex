import type { Scope } from "../ownership";

const mountedScopeKey = Symbol("reflex-dom.mounted-scope");

type MountedContainer = (ParentNode & Node) & {
  [mountedScopeKey]?: Scope | undefined;
};

export interface MountedScopeStore {
  get(container: ParentNode & Node): Scope | undefined;
  set(container: ParentNode & Node, scope: Scope): void;
  delete(container: ParentNode & Node): void;
}

export function createMountedScopeStore(): MountedScopeStore {
  return {
    get(container) {
      return (container as MountedContainer)[mountedScopeKey];
    },
    set(container, scope) {
      (container as MountedContainer)[mountedScopeKey] = scope;
    },
    delete(container) {
      delete (container as MountedContainer)[mountedScopeKey];
    },
  };
}
