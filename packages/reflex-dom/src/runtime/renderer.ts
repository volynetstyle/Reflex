import type { OwnerContext } from "reflex-framework/ownership";
import { createOwnerContext } from "reflex-framework/ownership";
import { renderWithRenderer } from "../render";
import type { Cleanup, JSXRenderable } from "../types";
import {
  createRendererRuntime,
  type DOMRuntimeOptions,
  type RuntimeInstance,
} from "./options";
import {
  createMountedScopeStore,
  type MountedScopeStore,
} from "./root-store";

export interface DOMRenderer {
  runtime: RuntimeInstance | null;
  owner: OwnerContext;
  mountedScopes: MountedScopeStore;
  ensureRuntime(): RuntimeInstance;
  render(input: JSXRenderable, container: ParentNode & Node): Cleanup;
  mount(input: JSXRenderable, container: ParentNode & Node): Cleanup;
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
