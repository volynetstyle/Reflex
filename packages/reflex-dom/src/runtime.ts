import { createRuntime } from "@volynetstyle/reflex";
import type { Scope, OwnerContext } from "./ownership";
import { createOwnerContext } from "./ownership";
import { Fragment, type JSXTag } from "./host/namespace";
import { createElement } from "./tree/create-element";
import { renderWithRenderer } from "./render";
import type {
  Cleanup,
  Component,
  DOMProps,
  JSXRenderable,
} from "./types";

export type DOMRuntimeOptions = Parameters<typeof createRuntime>[0];

export interface DOMRenderer {
  runtime: ReturnType<typeof createRuntime> | null;
  owner: OwnerContext;
  mountedScopes: WeakMap<ParentNode & Node, Scope>;
  ensureRuntime(): ReturnType<typeof createRuntime>;
  render(input: JSXRenderable, container: ParentNode & Node): Cleanup;
  mount(input: JSXRenderable, container: ParentNode & Node): Cleanup;
}

function createRendererRuntime(options?: DOMRuntimeOptions) {
  return createRuntime({
    effectStrategy: "eager",
    ...options,
  });
}

export function createDOMRenderer(options?: DOMRuntimeOptions): DOMRenderer {
  const renderer: DOMRenderer = {
    runtime: null,
    owner: createOwnerContext(),
    mountedScopes: new WeakMap(),
    ensureRuntime() {
      return (renderer.runtime ??= createRendererRuntime(options));
    },
    render(input, container) {
      return renderWithRenderer(renderer, input, container);
    },
    mount(input, container) {
      return renderWithRenderer(renderer, input, container);
    },
  };

  renderer.ensureRuntime();
  return renderer;
}

let activeRenderer: DOMRenderer | null = null;

function ensureRenderer() {
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

export const mount = render;
export { Fragment };

export function jsx(
  type: JSXTag,
  props: DOMProps | null,
  _key?: unknown,
): JSXRenderable {
  const p = props ?? {};

  if (type === Fragment) {
    return p.children ?? null;
  }

  if (typeof type === "function") {
    return (type as Component<any>)(p);
  }

  return createElement(ensureRenderer(), type, p, "html");
}

export const jsxs = jsx;
export const jsxDEV: typeof jsx = (type, props, key) => jsx(type, props, key);

export function useDOMRenderer(renderer: DOMRenderer | null) {
  activeRenderer = renderer;
}
