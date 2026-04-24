import {
  onEffectStart,
  registerCleanup,
  useEffect,
} from "@volynets/reflex-framework";
import type { PortalRenderable } from "../operators";
import { mountRenderRange, type MountedRenderRange } from "../structure/render-range";
import type { DOMRenderer } from "../runtime/renderer";

export function mountPortal(
  renderer: DOMRenderer,
  renderable: PortalRenderable,
): Node {
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

    activePortalRange = mountRenderRange(
      renderer,
      nextTarget,
      renderable.children,
      "html",
    );
  }

  remountIntoTarget(renderable.to());

  useEffect(renderer.owner, () => {
    const nextTarget = renderable.to();

    onEffectStart(() => {
      remountIntoTarget(nextTarget);
    });
  });

  registerCleanup(renderer.owner, () => {
    activePortalRange?.destroy();
    activePortalRange = null;
    activeTarget = null;
  });

  return placeholder;
}
