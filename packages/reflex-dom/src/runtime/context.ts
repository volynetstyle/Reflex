import {
  createOwnerContext,
  type OwnerContext,
} from "@volynets/reflex-framework";
import {
  createRendererRuntime,
  type DOMRuntimeOptions,
  type RuntimeInstance,
} from "./options";
import { createMountEffects, type MountEffects } from "./mount-effects";

/** Synchronous dynamic scope. Ownership and reactive state remain separate. */
export interface DOMContext {
  readonly runtime: RuntimeInstance;
  readonly owner: OwnerContext;
  readonly mountEffects: MountEffects;
}

let activeContext: DOMContext | null = null;
let defaultRuntime: RuntimeInstance | null = null;
let defaultRuntimeProvider: (() => RuntimeInstance) | null = null;

/** Client installs its lazy renderer factory without reversing layer dependencies. */
export function setDefaultDOMRuntimeProvider(
  provider: () => RuntimeInstance,
): void {
  defaultRuntimeProvider = provider;
}

/** The client registers its default runtime without making runtime depend on client. */
export function setDefaultDOMRuntime(runtime: RuntimeInstance | null): void {
  defaultRuntime = runtime;
}

export function getDefaultDOMRuntime(): RuntimeInstance {
  return (defaultRuntime ??=
    defaultRuntimeProvider?.() ?? createRendererRuntime());
}

export function createDOMContext(options?: DOMRuntimeOptions): DOMContext {
  const mountEffects = createMountEffects((task) =>
    context.runtime.run(() => withDOMContext(context, task)),
  );
  const context: DOMContext = {
    runtime: createRendererRuntime(options, mountEffects),
    owner: createOwnerContext(),
    mountEffects,
  };
  return context;
}

export function getDOMContext(): DOMContext {
  if (activeContext === null) throw new Error("DOM context is not active");
  return activeContext;
}

export function getActiveDOMContext(): DOMContext | null {
  return activeContext;
}

export function withDOMContext<T>(context: DOMContext, fn: () => T): T {
  if (activeContext === context) return fn();

  const previous = activeContext;
  activeContext = context;
  try {
    return fn();
  } finally {
    activeContext = previous;
  }
}

/** Native calls and nested renderers use the JavaScript stack for restoration. */
export function runDOMOperation<A extends unknown[], T>(
  context: DOMContext,
  fn: (...args: A) => T,
  ...args: A
): T {
  return context.runtime.batch(() =>
    withDOMContext(context, () => fn(...args)),
  );
}

export function dispatchDOMEvent(
  context: DOMContext,
  handler: EventListenerOrEventListenerObject,
  receiver: Element,
  event: Event,
): void {
  runDOMOperation(context, () => {
    if (typeof handler === "function") handler.call(receiver, event);
    else handler.handleEvent(event);
  });
}
