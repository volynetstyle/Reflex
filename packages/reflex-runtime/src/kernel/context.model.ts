import {
  DEFAULT_READ_TRACKING_STRATEGY,
  type ReadTrackingStrategy,
  type ReactiveSettledHook,
  type RuntimeConfiguration,
  type RuntimeConfigurationOptions,
  type RuntimeHooks,
  type SinkInvalidatedHook,
} from "./config";
import type { ReactiveNode } from "./shape";

const RUNTIME_CONTEXT_BRAND: unique symbol = Symbol("RuntimeContext");

export interface RuntimeContextOptions extends RuntimeConfigurationOptions {
  hooks?: RuntimeHooks;
}

export interface RuntimeContext extends RuntimeConfiguration {
  readonly [RUNTIME_CONTEXT_BRAND]: true;
  currentConsumer: ReactiveNode | null;
  trackingEpoch: number;
  propagationScopeDepth: number;
  batchDepth: number;
  pendingReactiveSettled: boolean;
}

export type RuntimeContextSnapshot = Omit<
  RuntimeContext,
  typeof RUNTIME_CONTEXT_BRAND
>;

export function createRuntimeContext(
  options: RuntimeContextOptions = {},
): RuntimeContext {
  const context = {
    [RUNTIME_CONTEXT_BRAND]: true,
    currentConsumer: null,
    trackingEpoch: 0,
    propagationScopeDepth: 0,
    batchDepth: 0,
    pendingReactiveSettled: false,
    readTrackingStrategy: DEFAULT_READ_TRACKING_STRATEGY,
    sinkInvalidatedHook: undefined,
    reactiveSettledHook: undefined,
  } satisfies  RuntimeContext;
  applyRuntimeContextOptions(context, options);
  return context;
}

export function isRuntimeContext(value: unknown): value is RuntimeContext {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as RuntimeContext)[RUNTIME_CONTEXT_BRAND] === true
  );
}

export function applyRuntimeContextOptions(
  context: RuntimeContext,
  options: RuntimeContextOptions,
): void {
  if ("readTrackingStrategy" in options) {
    context.readTrackingStrategy =
      asFunction<ReadTrackingStrategy>(options.readTrackingStrategy) ??
      DEFAULT_READ_TRACKING_STRATEGY;
  }

  if ("hooks" in options) {
    const hooks = options.hooks ?? {};
    context.sinkInvalidatedHook = ownFunction<SinkInvalidatedHook>(
      hooks,
      "sinkInvalidatedDispatcher",
    );
    context.reactiveSettledHook = ownFunction<ReactiveSettledHook>(
      hooks,
      "reactiveSettledDispatcher",
    );
  }
}

function asFunction<T>(value: unknown): T | undefined {
  return typeof value === "function" ? (value as T) : undefined;
}

function ownFunction<T>(
  hooks: RuntimeHooks,
  name: keyof RuntimeHooks,
): T | undefined {
  return Object.prototype.hasOwnProperty.call(hooks, name)
    ? asFunction<T>(hooks[name])
    : undefined;
}
