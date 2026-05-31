import {
  type OwnerContext,
} from "@volynets/reflex-framework";
import {
  hydrateWithDOMExecution,
  resumeWithDOMExecution,
} from "../hydrate/hydration";
import { renderWithDOMExecution } from "./render";
import type { Cleanup, JSXRenderable } from "../types";
import {
  type DOMRuntimeOptions,
  type RuntimeInstance,
} from "./options";
import type { MountedRootStore } from "./root-store";
import type { DOMRenderEffectScheduler } from "./render-effect-scheduler";
import {
  createDOMExecutionContext,
  ensureDOMRuntime,
  runWithDOMExecutionContext,
  type DOMExecutionContext,
} from "./execution";

export interface DOMRenderer {
  execution: DOMExecutionContext;
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
  const execution = createDOMExecutionContext(options);

  function runRendererOperation<T>(fn: () => T): T {
    const runtime = ensureDOMRuntime(execution);
    return runtime.batch(() => runWithDOMExecutionContext(execution, fn));
  }

  const renderer: DOMRenderer = {
    execution,
    get runtime() {
      return execution.runtime;
    },
    set runtime(runtime) {
      execution.runtime = runtime;
    },
    get owner() {
      return execution.owner;
    },
    set owner(owner) {
      execution.owner = owner;
    },
    get mountedRoots() {
      return execution.mountedRoots;
    },
    set mountedRoots(mountedRoots) {
      execution.mountedRoots = mountedRoots;
    },
    get renderEffectScheduler() {
      return execution.renderEffectScheduler;
    },
    set renderEffectScheduler(renderEffectScheduler) {
      execution.renderEffectScheduler = renderEffectScheduler;
    },
    ensureRuntime() {
      return ensureDOMRuntime(execution);
    },
    hydrate(input, container) {
      return runRendererOperation(() =>
        hydrateWithDOMExecution(input, container),
      );
    },
    render(input, container) {
      return runRendererOperation(() => renderWithDOMExecution(input, container));
    },
    mount(input, container) {
      return runRendererOperation(() => renderWithDOMExecution(input, container));
    },
    resume(container) {
      return runRendererOperation(() => resumeWithDOMExecution(container));
    },
  };

  renderer.ensureRuntime();
  return renderer;
}
