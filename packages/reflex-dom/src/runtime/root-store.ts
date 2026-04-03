import type { Scope } from "reflex-framework/ownership";

const mountedScopeKey = Symbol("reflex-dom.mounted-scope");

type MountedContainer = (ParentNode & Node) & {
  [mountedScopeKey]?: Scope | undefined;
};

export interface MountedScopeStore {
  get(container: MountedContainer): Scope | undefined;
  set(container: MountedContainer, scope: Scope): void;
  delete(container: MountedContainer): void;
}

export function createMountedScopeStore(): MountedScopeStore {
  return {
    get(container) {
      return container[mountedScopeKey];
    },
    set(container, scope) {
      container[mountedScopeKey] = scope;
    },
    delete(container) {
      container[mountedScopeKey] = undefined;
    },
  };
}
