import { recordDebugEvent } from "../debug/debug.runtime";
import { profileRuntimeCounter } from "../profiling";
import type { ReactiveEdge, ReactiveNode } from "./shape";
import { reuseIncomingEdgeFromSuffixOrCreate } from "./shape/graph";

export interface RuntimeDebugContext {
  readonly scope: "runtime";
}

export const defaultContext: RuntimeDebugContext = {
  scope: "runtime",
};

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

// #region Read tracking strategy

export type ReadTrackingStrategy = (
  source: ReactiveNode,
  consumer: ReactiveNode,
  prev: ReactiveEdge | null,
  nextExpected: ReactiveEdge | null,
  version: number,
) => ReactiveEdge;

export const DEFAULT_READ_TRACKING_STRATEGY: ReadTrackingStrategy =
  reuseIncomingEdgeFromSuffixOrCreate;

export let readTrackingStrategy: ReadTrackingStrategy =
  DEFAULT_READ_TRACKING_STRATEGY;

export function setReadTrackingStrategy(
  strategy: ReadTrackingStrategy | null | undefined,
): void {
  readTrackingStrategy = isFunction<ReadTrackingStrategy>(strategy)
    ? strategy
    : DEFAULT_READ_TRACKING_STRATEGY;
}

export function resetReadTrackingStrategy(): void {
  readTrackingStrategy = DEFAULT_READ_TRACKING_STRATEGY;
}

// #endregion

// #region Runtime hooks

export interface RuntimeHooks {
  sinkInvalidatedDispatcher?(node: ReactiveNode): void;
  reactiveSettledDispatcher?(): void;
  effectCleanupRegistrar?(dispose: () => void): void;
}

export type RuntimeHostHooks = RuntimeHooks;

export type SinkInvalidatedHook = RuntimeHooks["sinkInvalidatedDispatcher"];
export type ReactiveSettledHook = RuntimeHooks["reactiveSettledDispatcher"];
export type EffectCleanupHook = RuntimeHooks["effectCleanupRegistrar"];

export let sinkInvalidatedHook: SinkInvalidatedHook = undefined;
export let reactiveSettledHook: ReactiveSettledHook = undefined;
export let effectCleanupHook: EffectCleanupHook = undefined;

export function setSinkInvalidatedHook(
  hook: SinkInvalidatedHook = undefined,
): void {
  sinkInvalidatedHook = isFunction<SinkInvalidatedHook>(hook)
    ? hook
    : undefined;
}

export function setReactiveSettledHook(
  hook: ReactiveSettledHook = undefined,
): void {
  reactiveSettledHook = isFunction<ReactiveSettledHook>(hook)
    ? hook
    : undefined;
}

export function setEffectCleanupHook(
  hook: EffectCleanupHook = undefined,
): void {
  effectCleanupHook = isFunction<EffectCleanupHook>(hook)
    ? hook
    : undefined;
}

export function getReactiveSettledHook(): ReactiveSettledHook {
  return reactiveSettledHook;
}

export function getEffectCleanupHook(): EffectCleanupHook {
  return effectCleanupHook;
}

export function setRuntimeHooks(hooks: RuntimeHooks = {}): void {
  sinkInvalidatedHook = ownHook<SinkInvalidatedHook>(
    hooks,
    "sinkInvalidatedDispatcher",
  );

  reactiveSettledHook = ownHook<ReactiveSettledHook>(
    hooks,
    "reactiveSettledDispatcher",
  );

  effectCleanupHook = ownHook<EffectCleanupHook>(
    hooks,
    "effectCleanupRegistrar",
  );
}

export const setHostHooks = setRuntimeHooks;

export function setInternalHooks(
  sinkInvalidated: SinkInvalidatedHook = undefined,
  reactiveSettled: ReactiveSettledHook = undefined,
): void {
  setSinkInvalidatedHook(sinkInvalidated);
  setReactiveSettledHook(reactiveSettled);
}

export function resetRuntimeHooks(): void {
  sinkInvalidatedHook = undefined;
  reactiveSettledHook = undefined;
  effectCleanupHook = undefined;
}

// #endregion

// #region Runtime configuration

export interface RuntimeConfiguration {
  readTrackingStrategy: ReadTrackingStrategy;
  sinkInvalidatedHook: SinkInvalidatedHook;
  reactiveSettledHook: ReactiveSettledHook;
  effectCleanupHook: EffectCleanupHook;
}

export interface RuntimeConfigurationOptions {
  readTrackingStrategy?: ReadTrackingStrategy;
}

export function configureRuntime(
  options: RuntimeConfigurationOptions = {},
): void {
  if ("readTrackingStrategy" in options) {
    setReadTrackingStrategy(options.readTrackingStrategy);
  }
}

export function resetRuntimeConfiguration(): void {
  resetReadTrackingStrategy();
  resetRuntimeHooks();
}

export function saveRuntimeConfiguration(): RuntimeConfiguration {
  return {
    readTrackingStrategy,
    sinkInvalidatedHook,
    reactiveSettledHook,
    effectCleanupHook,
  };
}

export function restoreRuntimeConfiguration(
  configuration: RuntimeConfiguration,
): void {
  readTrackingStrategy =
    configuration.readTrackingStrategy ?? DEFAULT_READ_TRACKING_STRATEGY;

  sinkInvalidatedHook = configuration.sinkInvalidatedHook;
  reactiveSettledHook = configuration.reactiveSettledHook;
  effectCleanupHook = configuration.effectCleanupHook;
}

// #endregion

// #region Hook emitters

export function emitSinkInvalidated(node: ReactiveNode): void {
  profileRuntimeCounter("sinkInvalidatedEmits");

  if (IS_DEV) {
    recordDebugEvent(defaultContext, "watcher:invalidated", { node });
  }

  sinkInvalidatedHook?.(node);
}

export function emitReactiveSettled(): void {
  profileRuntimeCounter("contextSettledEmits");
  reactiveSettledHook?.();
}

// #endregion

// #region Helpers

function isFunction<T>(value: unknown): value is T {
  return typeof value === "function";
}

function ownHook<T>(
  hooks: RuntimeHooks,
  name: keyof RuntimeHooks,
): T | undefined {
  return Object.prototype.hasOwnProperty.call(hooks, name)
    ? isFunction<T>(hooks[name])
      ? hooks[name]
      : undefined
    : undefined;
}

// #endregion
