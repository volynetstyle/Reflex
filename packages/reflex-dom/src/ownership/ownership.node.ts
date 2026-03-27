import type {
  IOwnershipContextRecord,
} from "./ownership.context";

type Cleanup = (() => void) | Array<() => void>;

export class OwnershipNode {
  parent: OwnershipNode | null = null;
  firstChild: OwnershipNode | null = null;
  nextSibling: OwnershipNode | null = null;
  prevSibling: OwnershipNode | null = null;
  lastChild: OwnershipNode | null = null;

  // Lower 24 bits: child count. Upper 8 bits: flags.
  meta = 0;

  context: IOwnershipContextRecord | null = null;
  cleanups: Cleanup | null = null;
}
