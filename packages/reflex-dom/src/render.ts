import type { Cleanup, JSXRenderable } from "./types";
import type { DOMRenderer } from "./runtime";
import {
  createRenderRangeAnchors,
  mountRenderRange,
  type MountedRenderRange,
  type RenderRangeAnchors,
} from "./structure/render-range";

function resolveContainerRangeAnchors(
  renderer: DOMRenderer,
  container: ParentNode & Node,
): RenderRangeAnchors {
  const previousRoot = renderer.mountedRoots.get(container);

  if (previousRoot === undefined) {
    return createRenderRangeAnchors(container);
  }

  previousRoot.clear();
  return previousRoot;
}

function mountRenderableIntoContainerRange(
  renderer: DOMRenderer,
  renderable: JSXRenderable,
  container: ParentNode & Node,
): MountedRenderRange {
  const rangeAnchors = resolveContainerRangeAnchors(renderer, container);
  const rootMount = mountRenderRange(
    renderer,
    container,
    renderable,
    "html",
    rangeAnchors,
  );

  renderer.mountedRoots.set(container, rootMount);
  return rootMount;
}

export function renderWithRenderer(
  renderer: DOMRenderer,
  renderable: JSXRenderable,
  container: ParentNode & Node,
): Cleanup {
  renderer.ensureRuntime();
  const rootMount = mountRenderableIntoContainerRange(
    renderer,
    renderable,
    container,
  );

  const disposeRenderMount = (() => {
    rootMount.clear();

    if (renderer.mountedRoots.get(container) !== rootMount) {
      return;
    }

    renderer.mountedRoots.delete(container);
    rootMount.destroy();
  }) as Cleanup;

  disposeRenderMount.dispose = disposeRenderMount;
  return disposeRenderMount;
}
