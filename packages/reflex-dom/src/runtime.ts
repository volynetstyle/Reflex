import { createRuntime } from "@volynetstyle/reflex";
import type { Scope, OwnerContext } from "./ownership";
import { createOwnerContext } from "./ownership";
export { For, Show, Switch } from "./operators";
import { createComponentRenderable } from "./component";
import { createElementRenderable } from "./element";
import { Fragment, type JSXTag } from "./host/namespace";
import { renderWithRenderer } from "./render";
import type {
  AttributeKey,
  Cleanup,
  Component,
  DOMProps,
  ElementProps,
  ElementTag,
  JSXRenderable,
} from "./types";

export type DOMRuntimeOptions = Parameters<typeof createRuntime>[0];

const mountedScopeKey = Symbol("reflex-dom.mounted-scope");

type MountedContainer = (ParentNode & Node) & {
  [mountedScopeKey]?: Scope | undefined;
};

export interface MountedScopeStore {
  get(container: ParentNode & Node): Scope | undefined;
  set(container: ParentNode & Node, scope: Scope): void;
  delete(container: ParentNode & Node): void;
}

function createMountedScopeStore(): MountedScopeStore {
  return {
    get(container) {
      return (container as MountedContainer)[mountedScopeKey];
    },
    set(container, scope) {
      (container as MountedContainer)[mountedScopeKey] = scope;
    },
    delete(container) {
      delete (container as MountedContainer)[mountedScopeKey];
    },
  };
}

export interface DOMRenderer {
  runtime: ReturnType<typeof createRuntime> | null;
  owner: OwnerContext;
  mountedScopes: MountedScopeStore;
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
    mountedScopes: createMountedScopeStore(),
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

type FragmentProps = {
  children?: JSXRenderable;
};

type RuntimeComponent = (props: unknown) => JSXRenderable;

export function jsx(
  type: typeof Fragment,
  props: FragmentProps | null,
  _key?: AttributeKey,
): JSXRenderable;
export function jsx<Tag extends ElementTag>(
  type: Tag,
  props: ElementProps<Tag> | null,
  _key?: AttributeKey,
): JSXRenderable;
export function jsx<P>(
  type: Component<P>,
  props: P | null,
  _key?: AttributeKey,
): JSXRenderable;
export function jsx(
  type: JSXTag,
  props: DOMProps | Record<string, unknown> | FragmentProps | null,
  _key?: unknown,
): JSXRenderable {
  const p = props ?? {};

  if (type === Fragment) {
    return (p as FragmentProps).children ?? null;
  }

  if (typeof type === "function") {
    return createComponentRenderable(type as RuntimeComponent, p);
  }

  return createElementRenderable(
    type as ElementTag,
    p as ElementProps<ElementTag>,
  );
}

export const jsxs = jsx;
export const jsxDEV: typeof jsx = (
  type: JSXTag,
  props: DOMProps | Record<string, unknown> | FragmentProps | null,
  key?: unknown,
) => jsx(type as never, props as never, key as AttributeKey | undefined);

export function useDOMRenderer(renderer: DOMRenderer | null) {
  activeRenderer = renderer;
}
