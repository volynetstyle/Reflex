import {
  hydrateWithDOMExecution,
  resumeWithDOMExecution,
} from "../hydrate/hydration";
import { renderWithDOMExecution } from "./render";
import type { Cleanup, JSXRenderable } from "../types";
import type { DOMRuntimeOptions } from "./options";
import type { DOMRenderEffectScheduler } from "./render-effect-scheduler";
import {
  createDOMExecutionContext,
  ensureDOMRuntime,
  runDOMOperation,
  type DOMExecutionContext,
} from "./execution";

export interface DOMRenderer {
  readonly execution: DOMExecutionContext;
  readonly renderEffectScheduler: DOMRenderEffectScheduler;
  hydrate(input: JSXRenderable, container: ParentNode & Node): Cleanup;
  render(input: JSXRenderable, container: ParentNode & Node): Cleanup;
  mount(input: JSXRenderable, container: ParentNode & Node): Cleanup;
  resume(container: ParentNode & Node): Cleanup;
}

export function createDOMRenderer(options?: DOMRuntimeOptions): DOMRenderer {
  const execution = createDOMExecutionContext(options);
  const render = (input: JSXRenderable, container: ParentNode & Node) =>
    runDOMOperation(execution, () =>
      renderWithDOMExecution(input, container),
    );

  const renderer: DOMRenderer = {
    execution,
    renderEffectScheduler: execution.renderEffectScheduler,
    hydrate(input, container) {
      return runDOMOperation(execution, () =>
        hydrateWithDOMExecution(input, container),
      );
    },
    render,
    mount: render,
    resume(container) {
      return runDOMOperation(execution, () =>
        resumeWithDOMExecution(container),
      );
    },
  };

  ensureDOMRuntime(execution);
  return renderer;
}
