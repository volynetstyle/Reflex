import type { RootMountTable } from "@volynets/reflex-framework";
import type { MountedRenderRange } from "../structure/render-range";

type MountedContainer = (ParentNode & Node) & {
  root?: MountedRenderRange | undefined;
};

export type MountedRootStore = RootMountTable<
  MountedContainer,
  MountedRenderRange
>;

export type { MountedContainer };
