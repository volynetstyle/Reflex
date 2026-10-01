import {
  createOwnershipNode,
  disposeOwnershipNode,
} from "@volynets/reflex-framework";
import { ownerDocument } from "../host/document";
import type { Namespace } from "../host/namespace";
import type { JSXRenderable } from "../types";
import { runInDOMOwnershipNode } from "../runtime/lifetime";
import {
  createRangeAnchors,
  createOwnedRange,
  type RangeAnchors,
  type OwnedRange,
} from "../structure/owned-range";
import { appendRenderableNodes } from "./append";

export function mountOwnedRange(
  parent: Node,
  renderable: JSXRenderable | unknown,
  namespace: Namespace,
  anchors: RangeAnchors = createRangeAnchors(parent),
): OwnedRange {
  const ownershipNode = createOwnershipNode();
  const fragment = ownerDocument(parent).createDocumentFragment();

  try {
    runInDOMOwnershipNode(ownershipNode, () => {
      appendRenderableNodes(fragment, renderable, namespace);
    });

    parent.insertBefore(fragment, anchors.endAnchor);
    return createOwnedRange(ownershipNode, anchors);
  } catch (error) {
    disposeOwnershipNode(ownershipNode);
    anchors.startAnchor.remove();
    anchors.endAnchor.remove();
    throw error;
  }
}
