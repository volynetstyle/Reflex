import {
  createRootMountTable as createFrameworkMountedRootStore,
  type MountedRootStore as FrameworkMountedRootStore,
} from "@volynets/reflex-framework";
import type { MountedRenderRange } from "../structure/render-range";

type MountedContainer = (ParentNode & Node) & {
  root?: MountedRenderRange | undefined;
};

export type MountedRootStore = FrameworkMountedRootStore<
  MountedContainer,
  MountedRenderRange
>;

export function createRootMountTable(): MountedRootStore {
  return createFrameworkMountedRootStore<MountedContainer, MountedRenderRange>(
    "root",
  );
}
