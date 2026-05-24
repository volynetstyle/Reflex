import {
  DEFAULT_GRAPH_REDUCTION_OPTIONS,
  DEFAULT_READ_TRACKING_STRATEGY,
} from "./defaults";
import { normalizeHook } from "./hooks";
import {
  getActiveRuntimeContext,
  reloadActiveContextIfCurrent,
} from "./state";
import { normalizeGraphReductionOptions } from "../reduction";
import { RUNTIME_CONTEXT_BRAND } from "./types";
import type {
  ReactiveSettledHook,
  ReadTrackingStrategy,
  RuntimeContext,
  RuntimeContextOptions,
  RuntimeHostHooks,
  SinkInvalidatedHook,
} from "./types";

function isRuntimeContext(value: unknown): value is RuntimeContext {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as RuntimeContext)[RUNTIME_CONTEXT_BRAND] === true
  );
}

function setHostHooksForContext(
  context: RuntimeContext,
  hooks: RuntimeHostHooks = {},
): void {
  context.hostSinkInvalidatedHook = Object.hasOwn(
    hooks,
    "sinkInvalidatedDispatcher",
  )
    ? normalizeHook(hooks.sinkInvalidatedDispatcher)
    : undefined;
  context.hostReactiveSettledHook = Object.hasOwn(
    hooks,
    "reactiveSettledDispatcher",
  )
    ? normalizeHook(hooks.reactiveSettledDispatcher)
    : undefined;
}

function setInternalHooksForContext(
  context: RuntimeContext,
  onInvalidated: SinkInvalidatedHook = undefined,
  onSettled: ReactiveSettledHook = undefined,
): void {
  context.internalSinkInvalidatedHook =
    normalizeHook<SinkInvalidatedHook>(onInvalidated);
  context.internalReactiveSettledHook =
    normalizeHook<ReactiveSettledHook>(onSettled);
}

function setRuntimeContextOptionsForContext(
  context: RuntimeContext,
  options: RuntimeContextOptions = {},
): void {
  if (Object.hasOwn(options, "readTrackingStrategy")) {
    context.readTrackingStrategy =
      normalizeHook<ReadTrackingStrategy>(options.readTrackingStrategy) ??
      DEFAULT_READ_TRACKING_STRATEGY;
  }

  if (Object.hasOwn(options, "graphReductionPolicy")) {
    context.graphReductionPolicy = normalizeGraphReductionOptions(
      options.graphReductionPolicy,
      context.graphReductionPolicy,
    );
  }
}

export function setHostHooks(
  context: RuntimeContext,
  hooks?: RuntimeHostHooks,
): void;
export function setHostHooks(hooks?: RuntimeHostHooks): void;
export function setHostHooks(
  contextOrHooks: RuntimeContext | RuntimeHostHooks = {},
  maybeHooks: RuntimeHostHooks = {},
): void {
  if (isRuntimeContext(contextOrHooks)) {
    setHostHooksForContext(contextOrHooks, maybeHooks);
    reloadActiveContextIfCurrent(contextOrHooks);
    return;
  }

  const context = getActiveRuntimeContext();
  setHostHooksForContext(context, contextOrHooks);
  reloadActiveContextIfCurrent(context);
}

export function setInternalHooks(
  context: RuntimeContext,
  onInvalidated?: SinkInvalidatedHook,
  onSettled?: ReactiveSettledHook,
): void;
export function setInternalHooks(
  onInvalidated?: SinkInvalidatedHook,
  onSettled?: ReactiveSettledHook,
): void;
export function setInternalHooks(
  contextOrOnInvalidated: RuntimeContext | SinkInvalidatedHook = undefined,
  onInvalidatedOrSettled: SinkInvalidatedHook | ReactiveSettledHook = undefined,
  maybeSettled: ReactiveSettledHook = undefined,
): void {
  if (isRuntimeContext(contextOrOnInvalidated)) {
    setInternalHooksForContext(
      contextOrOnInvalidated,
      onInvalidatedOrSettled as SinkInvalidatedHook,
      maybeSettled,
    );
    reloadActiveContextIfCurrent(contextOrOnInvalidated);
    return;
  }

  const context = getActiveRuntimeContext();
  setInternalHooksForContext(
    context,
    contextOrOnInvalidated,
    onInvalidatedOrSettled as ReactiveSettledHook,
  );
  reloadActiveContextIfCurrent(context);
}

export function setRuntimeContextOptions(
  context: RuntimeContext,
  options?: RuntimeContextOptions,
): void;
export function setRuntimeContextOptions(
  options?: RuntimeContextOptions,
): void;
export function setRuntimeContextOptions(
  contextOrOptions: RuntimeContext | RuntimeContextOptions = {},
  maybeOptions: RuntimeContextOptions = {},
): void {
  if (isRuntimeContext(contextOrOptions)) {
    setRuntimeContextOptionsForContext(contextOrOptions, maybeOptions);
    reloadActiveContextIfCurrent(contextOrOptions);
    return;
  }

  const context = getActiveRuntimeContext();
  setRuntimeContextOptionsForContext(context, contextOrOptions);
  reloadActiveContextIfCurrent(context);
}

export function resetRuntimeContextOptions(context: RuntimeContext): void {
  context.readTrackingStrategy = DEFAULT_READ_TRACKING_STRATEGY;
  context.graphReductionPolicy = DEFAULT_GRAPH_REDUCTION_OPTIONS;
}
