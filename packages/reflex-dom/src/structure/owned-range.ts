import { ownerDocument } from "../host/document";
import { clearBetween } from "../host/mutations";
import {
  disposeOwnershipNode,
  type OwnershipNode,
} from "@volynets/reflex-framework";

export interface RangeAnchors {
  startAnchor: Text | Comment;
  endAnchor: Text | Comment;
}

export interface OwnedRange extends RangeAnchors {
  ownershipNode: OwnershipNode;
  clear(): void;
  destroy(): void;
}

export function createRangeAnchors(parent: Node): RangeAnchors {
  const doc = ownerDocument(parent);
  const startAnchor = doc.createTextNode("");
  const endAnchor = doc.createTextNode("");

  parent.appendChild(startAnchor);
  parent.appendChild(endAnchor);

  return { startAnchor, endAnchor };
}

export function adoptRangeAnchors(parent: Node): RangeAnchors {
  const doc = ownerDocument(parent);
  const startAnchor = doc.createTextNode("");
  const endAnchor = doc.createTextNode("");
  const firstChild = parent.firstChild;

  if (firstChild === null) {
    parent.appendChild(startAnchor);
    parent.appendChild(endAnchor);
  } else {
    parent.insertBefore(startAnchor, firstChild);
    parent.appendChild(endAnchor);
  }

  return { startAnchor, endAnchor };
}

export function createOwnedRange(
  ownershipNode: OwnershipNode,
  anchors: RangeAnchors,
): OwnedRange {
  const { startAnchor, endAnchor } = anchors;
  let cleared = false;
  let destroyed = false;

  const clearRange = (): void => {
    if (cleared) return;
    cleared = true;
    disposeOwnershipNode(ownershipNode);

    const parent = startAnchor.parentNode;
    if (parent !== null && endAnchor.parentNode === parent) {
      clearBetween(startAnchor, endAnchor);
    }
  };

  const destroyRange = (): void => {
    if (destroyed) return;
    destroyed = true;
    clearRange();
    startAnchor.remove();
    endAnchor.remove();
  };

  return {
    ownershipNode,
    startAnchor,
    endAnchor,
    clear: clearRange,
    destroy: destroyRange,
  };
}
