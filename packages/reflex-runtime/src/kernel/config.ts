import { recordDebugEvent } from "../../debug/debug.runtime";
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

// eslint-disable-next-line no-var
export var readTrackingStrategy: ReadTrackingStrategy =
  DEFAULT_READ_TRACKING_STRATEGY;

// #endregion

// #region Runtime hooks

export interface RuntimeHooks {
  /** Enqueue-only invalidation notification; reactive execution is forbidden. */
  onNodeInvalidated?(node: ReactiveNode): void;
  /** Idle host boundary; synchronous scheduler drain is permitted. */
  onRuntimeIdle?(): void;
}

export type RuntimeHostHooks = RuntimeHooks;

export type NodeInvalidatedHook = RuntimeHooks["onNodeInvalidated"];
export type RuntimeIdleHook = RuntimeHooks["onRuntimeIdle"];

// eslint-disable-next-line no-var
export var nodeInvalidatedHook: NodeInvalidatedHook = undefined;

// eslint-disable-next-line no-var
export var CAN_CALL_EMIT_NODE_INVALIDATED_HOOK =
  nodeInvalidatedHook !== undefined;

// eslint-disable-next-line no-var
export var runtimeIdleHook: RuntimeIdleHook = undefined;

// #endregion

// #region Runtime configuration

export interface RuntimeConfiguration {
  readTrackingStrategy: ReadTrackingStrategy;
  nodeInvalidatedHook: NodeInvalidatedHook;
  runtimeIdleHook: RuntimeIdleHook;
}

export interface RuntimeConfigurationOptions {
  readTrackingStrategy?: ReadTrackingStrategy;
}

export function saveRuntimeConfiguration(
  configuration: RuntimeConfiguration,
): void {
  configuration.readTrackingStrategy = readTrackingStrategy;
  configuration.nodeInvalidatedHook = nodeInvalidatedHook;
  configuration.runtimeIdleHook = runtimeIdleHook;
}

export function restoreRuntimeConfiguration(
  configuration: RuntimeConfiguration,
): void {
  readTrackingStrategy =
    configuration.readTrackingStrategy ?? DEFAULT_READ_TRACKING_STRATEGY;

  nodeInvalidatedHook = configuration.nodeInvalidatedHook;
  runtimeIdleHook = configuration.runtimeIdleHook;
}

// #endregion

// #region Hook emitters

// eslint-disable-next-line no-var
export var emitNodeInvalidated = !__DEV__
  ? (node: ReactiveNode) => {
      const hook = nodeInvalidatedHook;
      if (hook === undefined) return;

      hook(node);
    }
  : function (node: ReactiveNode): void {
      profileRuntimeCounter("nodeInvalidatedEmits");

      if (IS_DEV) {
        recordDebugEvent(defaultContext, "watcher:invalidated", { node });
      }

      const hook = nodeInvalidatedHook;
      if (hook === undefined) return;

      if (!__DEV__) {
        hook(node);
        return;
      }

      const before = readRuntimePhase();
      const phaseBefore = before.phase;
      const depthBefore = before.depth;

      enterRuntimeHook("onNodeInvalidated");
      try {
        hook(node);
        devAssertRuntimeHookDidNotReenter(
          "onNodeInvalidated",
          phaseBefore,
          depthBefore,
        );
      } finally {
        leaveRuntimeHook();
      }
    };

export function emitRuntimeIdle(): void {
  profileRuntimeCounter("contextSettledEmits");
  const hook = runtimeIdleHook;
  if (hook === undefined) return;

  if (!__DEV__) {
    hook();
    return;
  }

  const before = readRuntimePhase();
  const phaseBefore = before.phase;
  const depthBefore = before.depth;

  enterRuntimeHook("onRuntimeIdle");
  try {
    hook();
    devAssertRuntimeHookDidNotReenter(
      "onRuntimeIdle",
      phaseBefore,
      depthBefore,
    );
  } finally {
    leaveRuntimeHook();
  }
}

// #endregion
