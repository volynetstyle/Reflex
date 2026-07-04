import { recordDebugEvent } from "@runtime/debug/debug.runtime";
import { profileRuntimeCounter } from "@runtime/profiling";

import {
  devAssertRuntimeHookDidNotReenter,
  enterRuntimeHook,
  leaveRuntimeHook,
  readRuntimePhase,
} from "./execution";
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

// #endregion

// #region Runtime hooks

export interface RuntimeHooks {
  sinkInvalidatedDispatcher?(node: ReactiveNode): void;
  reactiveSettledDispatcher?(): void;
}

export type RuntimeHostHooks = RuntimeHooks;

export type SinkInvalidatedHook = RuntimeHooks["sinkInvalidatedDispatcher"];
export type ReactiveSettledHook = RuntimeHooks["reactiveSettledDispatcher"];

export let sinkInvalidatedHook: SinkInvalidatedHook = undefined;
export let reactiveSettledHook: ReactiveSettledHook = undefined;

// #endregion

// #region Runtime configuration

export interface RuntimeConfiguration {
  readTrackingStrategy: ReadTrackingStrategy;
  sinkInvalidatedHook: SinkInvalidatedHook;
  reactiveSettledHook: ReactiveSettledHook;
}

export interface RuntimeConfigurationOptions {
  readTrackingStrategy?: ReadTrackingStrategy;
}

export function saveRuntimeConfiguration(): RuntimeConfiguration {
  return {
    readTrackingStrategy,
    sinkInvalidatedHook,
    reactiveSettledHook,
  };
}

export function restoreRuntimeConfiguration(
  configuration: RuntimeConfiguration,
): void {
  readTrackingStrategy =
    configuration.readTrackingStrategy ?? DEFAULT_READ_TRACKING_STRATEGY;

  sinkInvalidatedHook = configuration.sinkInvalidatedHook;
  reactiveSettledHook = configuration.reactiveSettledHook;
}

// #endregion

// #region Hook emitters

export function emitSinkInvalidated(node: ReactiveNode): void {
  profileRuntimeCounter("sinkInvalidatedEmits");

  if (IS_DEV) {
    recordDebugEvent(defaultContext, "watcher:invalidated", { node });
  }

  const hook = sinkInvalidatedHook;
  if (hook === undefined) return;

  if (!__DEV__) {
    hook(node);
    return;
  }

  const before = readRuntimePhase();
  const phaseBefore = before.phase;
  const depthBefore = before.depth;

  enterRuntimeHook("sinkInvalidatedDispatcher");
  try {
    hook(node);
    devAssertRuntimeHookDidNotReenter(
      "sinkInvalidatedDispatcher",
      phaseBefore,
      depthBefore,
    );
  } finally {
    leaveRuntimeHook();
  }
}

export function emitReactiveSettled(): void {
  profileRuntimeCounter("contextSettledEmits");
  const hook = reactiveSettledHook;
  if (hook === undefined) return;

  if (!__DEV__) {
    hook();
    return;
  }

  const before = readRuntimePhase();
  const phaseBefore = before.phase;
  const depthBefore = before.depth;

  enterRuntimeHook("reactiveSettledDispatcher");
  try {
    hook();
    devAssertRuntimeHookDidNotReenter(
      "reactiveSettledDispatcher",
      phaseBefore,
      depthBefore,
    );
  } finally {
    leaveRuntimeHook();
  }
}

// #endregion
