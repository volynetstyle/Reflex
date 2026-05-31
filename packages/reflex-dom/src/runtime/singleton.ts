import type { Cleanup, JSXRenderable } from "../types";
import type { DOMRenderer } from "./renderer";
import { hydrateWithDOMExecution, resumeWithDOMExecution } from "../hydrate/hydration";
import type { DOMRuntimeOptions } from "./options";
import { renderWithDOMExecution } from "./render";
import {
  createDOMExecutionContext,
  ensureDOMRuntime,
  runWithDOMExecutionContext,
  type DOMExecutionContext,
} from "./execution";

let activeExecutionContext: DOMExecutionContext | null = null;

function ensureExecutionContext(): DOMExecutionContext {
  return (activeExecutionContext ??= createDOMExecutionContext());
}

function runSingletonOperation<T>(fn: () => T): T {
  const context = ensureExecutionContext();
  const runtime = ensureDOMRuntime(context);

  return runtime.batch(() => runWithDOMExecutionContext(context, fn));
}

export function createDOMRuntime(options?: DOMRuntimeOptions) {
  const context = createDOMExecutionContext(options);
  activeExecutionContext = context;
  return ensureDOMRuntime(context);
}

export function render(
  input: JSXRenderable,
  container: ParentNode & Node,
): Cleanup {
  return runSingletonOperation(() => renderWithDOMExecution(input, container));
}

export function hydrate(
  input: JSXRenderable,
  container: ParentNode & Node,
): Cleanup {
  return runSingletonOperation(() => hydrateWithDOMExecution(input, container));
}

export const mount = render;

export function resume(container: ParentNode & Node): Cleanup {
  return runSingletonOperation(() => resumeWithDOMExecution(container));
}

export function useDOMRenderer(renderer: DOMRenderer | null) {
  activeExecutionContext = renderer?.execution ?? null;
}
