import {
  createOwnerContext,
  runWithOwner,
  type OwnerContext,
  type OwnershipNode,
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
  const runtime = createRendererRuntime(options, mountEffects);
  const context: DOMContext = {
    runtime,
    // The owner tree lives in the renderer's domain; owner changes never
    // switch domains.
    owner: createOwnerContext(runtime.domain),
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

/** Low-level scope entry; callers restore the returned context in finally. */
export function swapDOMContext(context: DOMContext | null): DOMContext | null {
  const previous = activeContext;
  activeContext = context;
  return previous;
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
  return context.runtime.batch(() => {
    const previous = swapDOMContext(context);
    try {
      return fn(...args);
    } finally {
      swapDOMContext(previous);
    }
  });
}

/**
 * Where a deferred callback belongs: the renderer plus the ownership node that
 * was current when it was bound. Resources it creates close with that node.
 */
export interface DOMCallbackScope {
  readonly context: DOMContext;
  readonly node: OwnershipNode | null;
}

export function captureDOMCallbackScope(
  context: DOMContext = getDOMContext(),
): DOMCallbackScope {
  return { context, node: context.owner.currentNode };
}

/** Re-enters a captured scope: runtime batch, DOM context, then owner/node. */
export function runInDOMCallbackScope<T>(
  scope: DOMCallbackScope,
  fn: () => T,
): T {
  const context = scope.context;
  return context.runtime.batch(() => {
    const previous = swapDOMContext(context);
    try {
      return runWithOwner(context.owner, scope.node, fn);
    } finally {
      swapDOMContext(previous);
    }
  });
}

export function dispatchDOMEvent(
  scope: DOMCallbackScope,
  handler: EventListenerOrEventListenerObject,
  receiver: Element,
  event: Event,
): void {
  runInDOMCallbackScope(scope, () => {
    if (typeof handler === "function") handler.call(receiver, event);
    else handler.handleEvent(event);
  });
}
