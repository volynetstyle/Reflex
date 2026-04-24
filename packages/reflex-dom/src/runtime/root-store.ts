import type { MountedRenderRange } from "../structure/render-range";

type MountedContainer = (ParentNode & Node) & {
  root?: MountedRenderRange | undefined;
};

export interface MountedRootStore {
  get(container: MountedContainer): MountedRenderRange | undefined;
  set(container: MountedContainer, root: MountedRenderRange): void;
  delete(container: MountedContainer): void;
}

export function createMountedRootStore(): MountedRootStore {
  return {
    get(container) {
      return container.root;
    },
    set(container, root) {
      container.root = root;
    },
    delete(container) {
      container.root = undefined;
    },
  };
}
