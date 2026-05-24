import type { ReactiveEdge, ReactiveNode } from "../shape";
import type {
  GraphReductionOptions,
  NormalizedGraphReductionOptions,
} from "../reduction";

export const RUNTIME_CONTEXT_BRAND: unique symbol = Symbol("RuntimeContext");

export interface RuntimeHostHooks {
  sinkInvalidatedDispatcher?(node: ReactiveNode): void;
  reactiveSettledDispatcher?(): void;
}

export type ReadTrackingStrategy = (
  source: ReactiveNode,
  consumer: ReactiveNode,
  prev: ReactiveEdge | null,
  nextExpected: ReactiveEdge | null,
  version: number,
) => ReactiveEdge;

export interface RuntimeContextOptions {
  readTrackingStrategy?: ReadTrackingStrategy;
  graphReductionPolicy?: GraphReductionOptions | boolean;
}

export type SinkInvalidatedHook =
  RuntimeHostHooks["sinkInvalidatedDispatcher"];
export type ReactiveSettledHook =
  RuntimeHostHooks["reactiveSettledDispatcher"];

export interface RuntimeContext {
  readonly [RUNTIME_CONTEXT_BRAND]: true;
  currentConsumer: ReactiveNode | null;
  trackingEpoch: number;
  propagationScopeDepth: number;
  readTrackingStrategy: ReadTrackingStrategy;
  graphReductionPolicy: NormalizedGraphReductionOptions;
  internalSinkInvalidatedHook: SinkInvalidatedHook;
  internalReactiveSettledHook: ReactiveSettledHook;
  hostSinkInvalidatedHook: SinkInvalidatedHook;
  hostReactiveSettledHook: ReactiveSettledHook;
}

export interface RuntimeContextSnapshot {
  currentConsumer: ReactiveNode | null;
  trackingEpoch: number;
  propagationScopeDepth: number;
  readTrackingStrategy: ReadTrackingStrategy;
  graphReductionPolicy: NormalizedGraphReductionOptions;
  internalSinkInvalidatedHook: SinkInvalidatedHook;
  internalReactiveSettledHook: ReactiveSettledHook;
  hostSinkInvalidatedHook: SinkInvalidatedHook;
  hostReactiveSettledHook: ReactiveSettledHook;
}

export interface RuntimeDebugContext {
  readonly scope: "runtime";
}
