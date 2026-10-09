import type { JSXRenderable } from "../types";
import type { DOMRuntimeOptions, RuntimeInstance } from "../runtime/options";
import {
  setDefaultDOMRuntime,
  setDefaultDOMRuntimeProvider,
} from "../runtime/context";
import { createDOMRenderer, type DOMRenderer } from "./renderer";

let defaultRenderer: DOMRenderer | null = null;
const getRenderer = (): DOMRenderer => {
  if (defaultRenderer === null) useDOMRenderer(createDOMRenderer());
  return defaultRenderer!;
};

export function useDOMRenderer(renderer: DOMRenderer | null): void {
  defaultRenderer = renderer;
  setDefaultDOMRuntime(renderer?.execution.runtime ?? null);
}

export function createDOMRuntime(options?: DOMRuntimeOptions): RuntimeInstance {
  const renderer = createDOMRenderer(options);
  useDOMRenderer(renderer);
  return renderer.execution.runtime;
}

export function getActiveDOMRuntime(): RuntimeInstance {
  return getRenderer().execution.runtime;
}

setDefaultDOMRuntimeProvider(getActiveDOMRuntime);

export function render(input: JSXRenderable, container: ParentNode & Node) {
  return getRenderer().render(input, container);
}
export const mount = render;
export function hydrate(input: JSXRenderable, container: ParentNode & Node) {
  return getRenderer().hydrate(input, container);
}
export function resume(container: ParentNode & Node) {
  return getRenderer().resume(container);
}
