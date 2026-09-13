import {
  createOwnerContext,
  createRootMountTable,
} from "@volynets/reflex-framework";
import { getActiveRuntimeContext } from "@volynets/reflex-runtime/internal";
import {
  createRendererRuntime,
  type DOMRuntimeOptions,
  type RuntimeInstance,
} from "../options";
import { createRenderEffectScheduler } from "../render-effect-scheduler";
import type { MountedContainer, MountedRootStore } from "../root-store";
import type { MountedRenderRange } from "../../structure/render-range";
import { DOM_EXECUTION_CONTEXT_BRAND } from "./types";
import type { DOMExecutionContext } from "./types";

let activeDOMExecutionContext: DOMExecutionContext | null = null;
let activeRenderTask: (() => void) | null = null;
let activeRenderTaskContext: DOMExecutionContext | null = null;

function invokeActiveRenderTask(): void {
  runWithDOMExecutionContext(activeRenderTaskContext!, activeRenderTask!);
}

function runDOMRenderTask(
  context: DOMExecutionContext,
  task: () => void,
): void {
  const runtime = context.runtime;
  if (runtime === null || getActiveRuntimeContext() === runtime.execution) {
    runWithDOMExecutionContext(context, task);
    return;
  }

  const previousTask = activeRenderTask;
  const previousContext = activeRenderTaskContext;
  activeRenderTask = task;
  activeRenderTaskContext = context;
  try {
    runtime.run(invokeActiveRenderTask);
  } finally {
    activeRenderTask = previousTask;
    activeRenderTaskContext = previousContext;
  }
}

type DOMOperation = (
  first?: unknown,
  second?: unknown,
  third?: unknown,
) => unknown;
let activeDOMOperation: DOMOperation | null = null;
let activeDOMOperationContext: DOMExecutionContext | null = null;
let activeDOMOperationFirst: unknown;
let activeDOMOperationSecond: unknown;
let activeDOMOperationThird: unknown;

function invokeActiveDOMOperation(): unknown {
  const context = activeDOMOperationContext!;
  const previousContext = activeDOMExecutionContext;
  if (previousContext === context) {
    return activeDOMOperation!(
      activeDOMOperationFirst,
      activeDOMOperationSecond,
      activeDOMOperationThird,
    );
  }

  activeDOMExecutionContext = context;
  try {
    return activeDOMOperation!(
      activeDOMOperationFirst,
      activeDOMOperationSecond,
      activeDOMOperationThird,
    );
  } finally {
    activeDOMExecutionContext = previousContext;
  }
}

export function createDOMExecutionContext(
  options?: DOMRuntimeOptions,
): DOMExecutionContext {
  const context: DOMExecutionContext = {
    [DOM_EXECUTION_CONTEXT_BRAND]: true,
    runtime: null,
    options,
    owner: createOwnerContext(),
    mountedRoots: createRootMountTable<MountedContainer, MountedRenderRange>(
      "root",
    ) as MountedRootStore,
    renderEffectScheduler: createRenderEffectScheduler((task) =>
      runDOMRenderTask(context, task),
    ),
  };

  return context;
}

export function getActiveDOMExecutionContext(): DOMExecutionContext {
  if (activeDOMExecutionContext === null) {
    throw new Error("DOM execution context is not active");
  }

  return activeDOMExecutionContext;
}

export function enterDOMExecutionContext(
  context: DOMExecutionContext,
): DOMExecutionContext | null {
  const previous = activeDOMExecutionContext;
  activeDOMExecutionContext = context;
  return previous;
}

export function leaveDOMExecutionContext(
  previous: DOMExecutionContext | null,
): void {
  activeDOMExecutionContext = previous;
}

export function runWithDOMExecutionContext<T>(
  context: DOMExecutionContext,
  fn: () => T,
): T {
  const previousContext = activeDOMExecutionContext;

  if (previousContext === context) {
    return fn();
  }

  enterDOMExecutionContext(context);

  try {
    return fn();
  } finally {
    leaveDOMExecutionContext(previousContext);
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

export function runDOMOperation<T>(
  context: DOMExecutionContext,
  fn: () => T,
): T;
export function runDOMOperation<A, T>(
  context: DOMExecutionContext,
  fn: (first: A) => T,
  first: A,
): T;
export function runDOMOperation<A, B, T>(
  context: DOMExecutionContext,
  fn: (first: A, second: B) => T,
  first: A,
  second: B,
): T;
export function runDOMOperation<A, B, C, T>(
  context: DOMExecutionContext,
  fn: (first: A, second: B, third: C) => T,
  first: A,
  second: B,
  third: C,
): T;
export function runDOMOperation(
  context: DOMExecutionContext,
  fn: DOMOperation,
  first?: unknown,
  second?: unknown,
  third?: unknown,
): unknown {
  const previousOperation = activeDOMOperation;
  const previousOperationContext = activeDOMOperationContext;
  const previousFirst = activeDOMOperationFirst;
  const previousSecond = activeDOMOperationSecond;
  const previousThird = activeDOMOperationThird;
  activeDOMOperation = fn;
  activeDOMOperationContext = context;
  activeDOMOperationFirst = first;
  activeDOMOperationSecond = second;
  activeDOMOperationThird = third;

  try {
    return ensureDOMRuntime(context).batch(invokeActiveDOMOperation);
  } finally {
    activeDOMOperation = previousOperation;
    activeDOMOperationContext = previousOperationContext;
    activeDOMOperationFirst = previousFirst;
    activeDOMOperationSecond = previousSecond;
    activeDOMOperationThird = previousThird;
  }
}

function invokeDOMEventHandler(
  handler: EventListenerOrEventListenerObject,
  receiver: Element,
  event: Event,
): void {
  if (typeof handler === "function") {
    handler.call(receiver, event);
  } else {
    handler.handleEvent(event);
  }
}

export function dispatchDOMEvent(
  context: DOMExecutionContext,
  handler: EventListenerOrEventListenerObject,
  receiver: Element,
  event: Event,
): void {
  runDOMOperation(context, invokeDOMEventHandler, handler, receiver, event);
}
