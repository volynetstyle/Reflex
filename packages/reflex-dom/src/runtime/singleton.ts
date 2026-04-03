import type { Cleanup, JSXRenderable } from "../types";
import { createDOMRenderer, type DOMRenderer } from "./renderer";
import type { DOMRuntimeOptions } from "./options";

let activeRenderer: DOMRenderer | null = null;

function ensureRenderer(): DOMRenderer {
  return (activeRenderer ??= createDOMRenderer());
}

export function createDOMRuntime(options?: DOMRuntimeOptions) {
  const renderer = createDOMRenderer(options);
  activeRenderer = renderer;
  return renderer.ensureRuntime();
}

export function render(
  input: JSXRenderable,
  container: ParentNode & Node,
): Cleanup {
  return ensureRenderer().render(input, container);
}

export function hydrate(
  input: JSXRenderable,
  container: ParentNode & Node,
): Cleanup {
  return ensureRenderer().hydrate(input, container);
}

export const mount = render;

export function resume(container: ParentNode & Node): Cleanup {
  return ensureRenderer().resume(container);
}

export function useDOMRenderer(renderer: DOMRenderer | null) {
  activeRenderer = renderer;
}
