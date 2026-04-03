import { clearBetween } from "../host/mutations";
import type { Namespace } from "../host/namespace";
import {
  createScope,
  disposeScope,
  type Scope,
} from "reflex-framework/ownership";
import { runInOwnershipScope } from "reflex-framework/ownership/reflex";
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

function resolveOwnerDocument(parent: Node): Document {
  return parent.ownerDocument ?? document;
}

export function createRenderRangeAnchors(parent: Node): RenderRangeAnchors {
  const ownerDocument = resolveOwnerDocument(parent);
  const startAnchor = ownerDocument.createTextNode("");
  const endAnchor = ownerDocument.createTextNode("");

  parent.appendChild(startAnchor);
  parent.appendChild(endAnchor);

  return {
    startAnchor,
    endAnchor,
  };
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

  return {
    startAnchor,
    endAnchor,
  };
}

export function createRenderRangeMount(
  scope: Scope,
  anchors: RenderRangeAnchors,
): MountedRenderRange {
  let isCleared = false;
  let isDestroyed = false;

  return {
    scope,
    ...anchors,

    clear(): void {
      if (isCleared || isDestroyed) {
        return;
      }

      isCleared = true;
      disposeScope(scope);

      const rangeParent = anchors.startAnchor.parentNode;
      if (rangeParent !== null && anchors.endAnchor.parentNode === rangeParent) {
        clearBetween(anchors.startAnchor, anchors.endAnchor);
      }
    },

    destroy(): void {
      if (isDestroyed) {
        return;
      }

      this.clear();
      anchors.startAnchor.remove();
      anchors.endAnchor.remove();
      isDestroyed = true;
    },
  };
}

function mountRangeContent(
  renderer: DOMRenderer,
  parent: Node,
  endAnchor: Node,
  renderable: JSXRenderable | unknown,
  namespace: Namespace,
  scope: Scope,
): void {
  const ownerDocument = resolveOwnerDocument(parent);
  const fragment = ownerDocument.createDocumentFragment();

  runInOwnershipScope(renderer.owner, scope, () => {
    appendRenderableNodes(renderer, fragment, renderable, namespace);
  });

  parent.insertBefore(fragment, endAnchor);
}

export function mountRenderRange(
  renderer: DOMRenderer,
  parent: Node,
  renderable: JSXRenderable | unknown,
  namespace: Namespace,
  anchors: RenderRangeAnchors = createRenderRangeAnchors(parent),
): MountedRenderRange {
  const scope = createScope();

  mountRangeContent(
    renderer,
    parent,
    anchors.endAnchor,
    renderable,
    namespace,
    scope,
  );

  return createRenderRangeMount(scope, anchors);
}
