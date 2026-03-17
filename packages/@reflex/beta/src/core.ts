// Core data model for the reactive graph.
//
// The runtime is built from nodes and directed edges:
// - signals are mutable sources
// - computeds are pure lazy derivations
// - effects are owner scopes for side effects and cleanup
//
// Time is tracked with monotonic epochs:
// - `t`: when this node's value last changed
// - `v`: when this node was last recomputed/validated
// - `s`: dependency-tracking epoch used to retain live inbound edges
export const enum ReactiveNodeState {
  // Node value is definitely stale and must not be read as current.
  Invalid = 1,
  // A dependency may have changed after the last validation pass.
  Obsolete = 2,
  // Node is currently considered scheduled/ordered in the graph.
  Ordered = 4,
  // The last tracking pass reused all current dependencies without churn.
  Tracking = 8,
  // Node was explicitly disposed and must not participate in updates.
  Disposed = 16,
}

export const DIRTY_STATE =
  ReactiveNodeState.Invalid | ReactiveNodeState.Obsolete;
export const TRACKING_STATE = ReactiveNodeState.Tracking;

export const enum ReactiveNodeKind {
  Signal = 0,
  // Pure lazy derivation. Does not own resources or child scopes.
  Computed = 1,
  // Reactive owner scope for side effects, cleanup, and child disposal.
  Effect = 2,
}

export const CLEANUP_STATE = ~(
  ReactiveNodeState.Invalid | ReactiveNodeState.Obsolete
);

export function hasState(
  state: number,
  flags: ReactiveNodeState | number,
): boolean {
  return (state & flags) !== 0;
}

export function isDirtyState(state: number): boolean {
  return hasState(state, DIRTY_STATE);
}

export function isTrackingState(state: number): boolean {
  return hasState(state, TRACKING_STATE);
}

export function isDisposedState(state: number): boolean {
  return hasState(state, ReactiveNodeState.Disposed);
}

export function isCleanOrSignal(state: number, kind: number) {
  return !hasState(state, DIRTY_STATE) && kind === ReactiveNodeKind.Signal;
}

export function isSignalKind(kind: ReactiveNodeKind): boolean {
  return kind === ReactiveNodeKind.Signal;
}

export function isEffectKind(kind: ReactiveNodeKind): boolean {
  return kind === ReactiveNodeKind.Effect;
}

// A graph edge means "to depends on from".
//
// `nextOut` threads the producer's fan-out list.
// `nextIn` threads the consumer's dependency list.
// `s` is updated during dependency tracking to keep live edges.
export class ReactiveEdge {
  nextOut: ReactiveEdge | null = null;
  nextIn: ReactiveEdge | null = null;
  s: number = 0;

  constructor(
    public from: ReactiveNode,
    public to: ReactiveNode,
  ) {}
}

// A single reactive vertex.
//
// The same shape is used for signals, computeds, and effects. The `kind`
// field defines semantics; the rest of the engine operates over this uniform
// graph representation.
export class ReactiveNode {
  // Epoch when this node's observable value last changed.
  t: number;
  // Epoch when this node was last recomputed or confirmed fresh.
  v: number;

  // Bitset of ReactiveNodeState flags.
  state: number;

  // Derivation function for computeds/effects. Null for plain signals.
  compute: (() => unknown) | null;
  // Current cached value for this node.
  value: unknown;

  // Tracking epoch for dependency retention during recompute.
  s: number;

  readonly kind: ReactiveNodeKind;

  // Outbound dependents: nodes that read from this node.
  firstOut: ReactiveEdge | null;
  // Inbound dependencies: nodes this node currently reads from.
  firstIn: ReactiveEdge | null;

  constructor(
    value: unknown,
    compute: (() => unknown) | null,
    state: number,
    kind: ReactiveNodeKind,
  ) {
    this.value = value;
    this.compute = compute;
    this.kind = kind;

    this.t = 0;
    this.v = 0;
    this.s = 0;

    this.state = state;

    this.firstOut = null;
    this.firstIn = null;
  }
}

export interface EngineHooks {
  onEffectInvalidated?(node: ReactiveNode): void;
}

// Shared mutable runtime context.
//
// This object owns traversal buffers and the global epoch so hot paths can
// avoid per-call allocations.
export class EngineContext {
  firstDirty: ReactiveNode | null = null;
  epoch: number = 1;
  // The consumer currently collecting dependencies.
  activeComputed: ReactiveNode | null = null;
  // DFS stack used while propagating invalidation.
  readonly trawelList: ReactiveNode[] = [];
  // Stack used while recursively refreshing dirty computeds.
  readonly worklist: ReactiveNode[] = [];
  readonly hooks: EngineHooks;

  constructor(hooks: EngineHooks = {}) {
    this.hooks = hooks;
  }

  bumpEpoch() {
    return ++this.epoch;
  }

  getEpoch() {
    return this.epoch;
  }

  notifyEffectInvalidated(node: ReactiveNode) {
    this.hooks.onEffectInvalidated?.(node);
  }
}
