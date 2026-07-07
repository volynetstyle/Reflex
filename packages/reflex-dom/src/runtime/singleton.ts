import type { Cleanup, JSXRenderable } from "../types";
import type { DOMRenderer } from "./renderer";
import { hydrateWithDOMExecution, resumeWithDOMExecution } from "../hydrate/hydration";
import type { DOMRuntimeOptions, RuntimeInstance } from "./options";
import { renderWithDOMExecution } from "./render";
import {
  createDOMExecutionContext,
  ensureDOMRuntime,
  runDOMOperation,
  type DOMExecutionContext,
} from "./execution";

let activeExecutionContext: DOMExecutionContext | null = null;

export function createDOMRuntime(options?: DOMRuntimeOptions): RuntimeInstance {
  const context = createDOMExecutionContext(options);
  activeExecutionContext = context;
  return ensureDOMRuntime(context);
}

export function render(
  input: JSXRenderable,
  container: ParentNode & Node,
): Cleanup {
  const context = (activeExecutionContext ??= createDOMExecutionContext());
  return runDOMOperation(context, () =>
    renderWithDOMExecution(input, container),
  );
}

export function hydrate(
  input: JSXRenderable,
  container: ParentNode & Node,
): Cleanup {
  const context = (activeExecutionContext ??= createDOMExecutionContext());
  return runDOMOperation(context, () =>
    hydrateWithDOMExecution(input, container),
  );
}

export const mount = render;

export function resume(container: ParentNode & Node): Cleanup {
  const context = (activeExecutionContext ??= createDOMExecutionContext());
  return runDOMOperation(context, () => resumeWithDOMExecution(container));
}

export function useDOMRenderer(renderer: DOMRenderer | null) {
  activeExecutionContext = renderer?.execution ?? null;
}
