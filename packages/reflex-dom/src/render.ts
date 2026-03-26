import type { Cleanup, JSXRenderable } from "./types";
import type { DOMRenderer } from "./runtime";
import { createScope, disposeScope, runWithScope } from "./ownership";
import { appendRenderableNodes } from "./tree/create-nodes";

export function renderWithRenderer(
  renderer: DOMRenderer,
  input: JSXRenderable,
  container: ParentNode & Node,
): Cleanup {
  renderer.ensureRuntime();

  const previousScope = renderer.mountedScopes.get(container);
  if (previousScope !== undefined) {
    disposeScope(previousScope);
    renderer.mountedScopes.delete(container);
  }

  const scope = createScope();

  container.replaceChildren();

  runWithScope(renderer.owner, scope, () => {
    appendRenderableNodes(renderer, container, input, "html");
  });

  renderer.mountedScopes.set(container, scope);

  const dispose = Object.assign(
    () => {
      disposeScope(scope);

      if (renderer.mountedScopes.get(container) === scope) {
        renderer.mountedScopes.delete(container);
        container.replaceChildren();
      }
    },
    {
      dispose: undefined as unknown as () => void,
    },
  ) as Cleanup;

  dispose.dispose = dispose;
  return dispose;
}