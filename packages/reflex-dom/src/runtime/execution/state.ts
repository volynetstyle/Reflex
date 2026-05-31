import { createOwnerContext } from "@volynets/reflex-framework";
import {
  createRendererRuntime,
  type DOMRuntimeOptions,
  type RuntimeInstance,
} from "../options";
import {
  createRenderEffectScheduler,
} from "../render-effect-scheduler";
import { createMountedRootStore } from "../root-store";
import { DOM_EXECUTION_CONTEXT_BRAND } from "./types";
import type { DOMExecutionContext } from "./types";

let activeDOMExecutionContext: DOMExecutionContext | null = null;

export function createDOMExecutionContext(
  options?: DOMRuntimeOptions,
): DOMExecutionContext {
  const context: DOMExecutionContext = {
    [DOM_EXECUTION_CONTEXT_BRAND]: true,
    runtime: null,
    options,
    owner: createOwnerContext(),
    mountedRoots: createMountedRootStore(),
    renderEffectScheduler: createRenderEffectScheduler((task) => {
      runWithDOMExecutionContext(context, task);
    }),
  };

  return context;
}

export function getActiveDOMExecutionContext(): DOMExecutionContext {
  if (activeDOMExecutionContext === null) {
    throw new Error("DOM execution context is not active");
  }

  return activeDOMExecutionContext;
}

export function setActiveDOMExecutionContext(
  context: DOMExecutionContext | null,
): void {
  activeDOMExecutionContext = context;
}

export function runWithDOMExecutionContext<T>(
  context: DOMExecutionContext,
  fn: () => T,
): T {
  const previousContext = activeDOMExecutionContext;

  if (previousContext === context) {
    return fn();
  }

  activeDOMExecutionContext = context;

  try {
    return fn();
  } finally {
    activeDOMExecutionContext = previousContext;
  }
}

export function ensureDOMRuntime(
  context: DOMExecutionContext = getActiveDOMExecutionContext(),
): RuntimeInstance {
  return (context.runtime ??= createRendererRuntime(
    context.options,
    context.renderEffectScheduler,
  ));
}
