import type { Cleanup, JSXRenderable } from "../types";
import {
  createRenderRangeAnchors,
  mountRenderRange,
} from "../structure/render-range";
import {
  getActiveDOMExecutionContext,
  runWithDOMExecutionContext,
} from "./execution";

export function renderWithDOMExecution(
  renderable: JSXRenderable,
  container: ParentNode & Node,
): Cleanup {
  const context = getActiveDOMExecutionContext();
  const previousRoot = context.mountedRoots.get(container);
  const anchors = previousRoot ?? createRenderRangeAnchors(container);

  previousRoot?.clear();

  const rootMount = mountRenderRange(container, renderable, "html", anchors);
  context.mountedRoots.set(container, rootMount);
  context.renderEffectScheduler.flush();

  const disposeRenderMount = (() => {
    runWithDOMExecutionContext(context, () => {
      rootMount.clear();

      if (context.mountedRoots.get(container) !== rootMount) {
        return;
      }

      context.mountedRoots.unset(container);
      rootMount.destroy();
    });
  }) as Cleanup;

  disposeRenderMount.dispose = disposeRenderMount;
  return disposeRenderMount;
}
