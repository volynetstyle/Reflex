import type { PortalRenderable } from "../operators";
import { mountOwnedRange } from "../mount/range";
import { type OwnedRange } from "../structure/owned-range";
import {
  createDOMOwnedReaction,
  registerDOMCleanup,
} from "../runtime/lifetime";

export function mountPortal(renderable: PortalRenderable, doc: Document): Node {
  const placeholder = doc.createTextNode("");
  let activePortalRange: OwnedRange | null = null;
  let activeTarget: (ParentNode & Node) | null | undefined;

  function remountIntoTarget(
    nextTarget: (ParentNode & Node) | null | undefined,
  ): void {
    if (activeTarget === nextTarget) {
      return;
    }

    activePortalRange?.destroy();
    activePortalRange = null;
    activeTarget = nextTarget;

    if (nextTarget == null) {
      return;
    }

    activePortalRange = mountOwnedRange(
      nextTarget,
      renderable.children,
      "html",
    );
  }

  remountIntoTarget(renderable.to());

  createDOMOwnedReaction(renderable.to, remountIntoTarget);

  registerDOMCleanup(() => {
    activePortalRange?.destroy();
    activePortalRange = null;
    activeTarget = null;
  });

  return placeholder;
}
