import type { Cleanup } from "../types/core";
import type { OwnershipContextRecord } from "./ownership.context";

type CleanupList = Cleanup | Cleanup[];

export class OwnershipNode {
  parent: OwnershipNode | null = null;
  firstChild: OwnershipNode | null = null;
  nextSibling: OwnershipNode | null = null;
  prevSibling: OwnershipNode | null = null;
  lastChild: OwnershipNode | null = null;

  // Lower 24 bits: child count. Upper 8 bits: flags.
  meta = 0;

  context: OwnershipContextRecord | null = null;
  cleanups: CleanupList | null = null;
}
