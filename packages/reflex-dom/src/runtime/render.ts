import type { Cleanup, JSXRenderable } from "../types";
import {
  createRenderRangeAnchors,
  mountRenderRange,
  type MountedRenderRange,
  type RenderRangeAnchors,
} from "../structure/render-range";
import {
  ensureDOMRuntime,
  getActiveDOMExecutionContext,
  runWithDOMExecutionContext,
} from "./execution";

function resolveContainerRangeAnchors(
  container: ParentNode & Node,
): RenderRangeAnchors {
  const context = getActiveDOMExecutionContext();
  const previousRoot = context.mountedRoots.get(container);

  if (previousRoot === undefined) {
    return createRenderRangeAnchors(container);
  }

  previousRoot.clear();
  return previousRoot;
}

function mountRenderableIntoContainerRange(
  renderable: JSXRenderable,
  container: ParentNode & Node,
): MountedRenderRange {
  const context = getActiveDOMExecutionContext();
  const rangeAnchors = resolveContainerRangeAnchors(container);
  const rootMount = mountRenderRange(container, renderable, "html", rangeAnchors);

  context.mountedRoots.set(container, rootMount);
  return rootMount;
}

export function renderWithDOMExecution(
  renderable: JSXRenderable,
  container: ParentNode & Node,
): Cleanup {
  const context = getActiveDOMExecutionContext();
  ensureDOMRuntime(context);
  const rootMount = mountRenderableIntoContainerRange(renderable, container);
  context.renderEffectScheduler.flush();

  const disposeRenderMount = (() => {
    runWithDOMExecutionContext(context, () => {
      rootMount.clear();

      if (context.mountedRoots.get(container) !== rootMount) {
        return;
      }

      context.mountedRoots.delete(container);
      rootMount.destroy();
    });
  }) as Cleanup;

  disposeRenderMount.dispose = disposeRenderMount;
  return disposeRenderMount;
}
