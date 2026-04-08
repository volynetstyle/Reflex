import type { MountedRenderRange } from "../structure/render-range";

const mountedRootKey = Symbol("reflex-dom.mounted-root");

type MountedContainer = (ParentNode & Node) & {
  [mountedRootKey]?: MountedRenderRange | undefined;
};

export interface MountedRootStore {
  get(container: MountedContainer): MountedRenderRange | undefined;
  set(container: MountedContainer, root: MountedRenderRange): void;
  delete(container: MountedContainer): void;
}

export function createMountedRootStore(): MountedRootStore {
  return {
    get(container) {
      return container[mountedRootKey];
    },
    set(container, root) {
      container[mountedRootKey] = root;
    },
    delete(container) {
      container[mountedRootKey] = undefined;
    },
  };
}
