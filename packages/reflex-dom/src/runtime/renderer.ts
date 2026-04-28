import {
  createOwnerContext,
  type OwnerContext,
} from "@volynets/reflex-framework";
import { hydrateWithRenderer, resumeWithRenderer } from "../hydrate/hydration";
import { renderWithRenderer } from "./render";
import type { Cleanup, JSXRenderable } from "../types";
import {
  createRendererRuntime,
  type DOMRuntimeOptions,
  type RuntimeInstance,
} from "./options";
import {
  createMountedRootStore,
  type MountedRootStore,
} from "./root-store";
import {
  createRenderEffectScheduler,
  type DOMRenderEffectScheduler,
} from "./render-effect-scheduler";

export interface DOMRenderer {
  runtime: RuntimeInstance | null;
  owner: OwnerContext;
  mountedRoots: MountedRootStore;
  renderEffectScheduler: DOMRenderEffectScheduler;
  ensureRuntime(): RuntimeInstance;
  hydrate(input: JSXRenderable, container: ParentNode & Node): Cleanup;
  render(input: JSXRenderable, container: ParentNode & Node): Cleanup;
  mount(input: JSXRenderable, container: ParentNode & Node): Cleanup;
  resume(container: ParentNode & Node): Cleanup;
}

export function createDOMRenderer(options?: DOMRuntimeOptions): DOMRenderer {
  const renderer: DOMRenderer = {
    runtime: null,
    owner: createOwnerContext(),
    mountedRoots: createMountedRootStore(),
    renderEffectScheduler: createRenderEffectScheduler(),
    ensureRuntime() {
      return (renderer.runtime ??= createRendererRuntime(
        options,
        renderer.renderEffectScheduler,
      ));
    },
    hydrate(input, container) {
      return hydrateWithRenderer(renderer, input, container);
    },
    render(input, container) {
      return renderWithRenderer(renderer, input, container);
    },
    mount(input, container) {
      return renderWithRenderer(renderer, input, container);
    },
    resume(container) {
      return resumeWithRenderer(renderer, container);
    },
  };

  renderer.ensureRuntime();
  return renderer;
}
