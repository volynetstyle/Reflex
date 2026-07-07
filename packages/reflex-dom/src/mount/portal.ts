import type { PortalRenderable } from "../operators";
import {
  mountRenderRange,
  type MountedRenderRange,
} from "../structure/render-range";
import {
  createDOMOwnedReaction,
  registerDOMCleanup,
} from "../runtime/execution";

export function mountPortal(renderable: PortalRenderable): Node {
  const placeholder = document.createTextNode("");
  let activePortalRange: MountedRenderRange | null = null;
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

    activePortalRange = mountRenderRange(nextTarget, renderable.children, "html");
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
