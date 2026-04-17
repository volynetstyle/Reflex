import { clearBetween } from "../host/mutations";
import type { Namespace } from "../host/namespace";
import {
  createScope,
  disposeScope,
  type Scope,
} from "@volynets/reflex-framework/ownership";
import { runInOwnershipScope } from "@volynets/reflex-framework/ownership/reflex";
import type { DOMRenderer } from "../runtime";
import type { JSXRenderable } from "../types";
import { appendRenderableNodes } from "../mount/append";

export interface RenderRangeAnchors {
  startAnchor: Text;
  endAnchor: Text;
}

export interface MountedRenderRange extends RenderRangeAnchors {
  scope: Scope;
  clear(): void;
  destroy(): void;
}

const enum MountState {
  None = 0,
  Cleared = 1 << 0,
  Destroyed = 1 << 1,
}

function resolveOwnerDocument(parent: Node): Document {
  return parent.nodeType === Node.DOCUMENT_NODE
    ? (parent as Document)
    : (parent.ownerDocument ?? document);
}

export function createRenderRangeAnchors(parent: Node): RenderRangeAnchors {
  const ownerDocument = resolveOwnerDocument(parent);
  const startAnchor = ownerDocument.createTextNode("");
  const endAnchor = ownerDocument.createTextNode("");

  parent.appendChild(startAnchor);
  parent.appendChild(endAnchor);

  return { startAnchor, endAnchor };
}

export function adoptExistingContentRange(parent: Node): RenderRangeAnchors {
  const ownerDocument = resolveOwnerDocument(parent);
  const startAnchor = ownerDocument.createTextNode("");
  const endAnchor = ownerDocument.createTextNode("");
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

export function createRenderRangeMount(
  scope: Scope,
  anchors: RenderRangeAnchors,
): MountedRenderRange {
  const { startAnchor, endAnchor } = anchors;
  let state = MountState.None;

  const clearRange = (): void => {
    if ((state & (MountState.Cleared | MountState.Destroyed)) !== 0) {
      return;
    }

    state |= MountState.Cleared;
    disposeScope(scope);

    const parent = startAnchor.parentNode;
    if (parent !== null && endAnchor.parentNode === parent) {
      clearBetween(startAnchor, endAnchor);
    }
  };

  const destroyRange = (): void => {
    if ((state & MountState.Destroyed) !== 0) {
      return;
    }

    clearRange();
    startAnchor.remove();
    endAnchor.remove();
    state |= MountState.Destroyed;
  };

  return {
    scope,
    startAnchor,
    endAnchor,
    clear: clearRange,
    destroy: destroyRange,
  };
}

export function mountRenderRange(
  renderer: DOMRenderer,
  parent: Node,
  renderable: JSXRenderable | unknown,
  namespace: Namespace,
  anchors: RenderRangeAnchors = createRenderRangeAnchors(parent),
): MountedRenderRange {
  const scope = createScope();
  const fragment = resolveOwnerDocument(parent).createDocumentFragment();

  runInOwnershipScope(renderer.owner, scope, () => {
    appendRenderableNodes(renderer, fragment, renderable, namespace);
  });

  parent.insertBefore(fragment, anchors.endAnchor);
  return createRenderRangeMount(scope, anchors);
}
