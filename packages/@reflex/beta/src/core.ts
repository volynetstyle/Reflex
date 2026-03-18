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
  // Propagation hint: some upstream write touched this dependency path.
  Invalid = 1 << 0,
  // Version proof: a dependency changed after the last validation pass.
  Obsolete = 1 << 1,
  // The last tracking pass reused all current dependencies without churn.
  Tracking = 1 << 2,
  // Effect
  SideEffect = 1 << 3,
  // Node was explicitly disposed and must not participate in updates.
  Disposed = 1 << 4,
  // Temporary guard used while a node is actively recomputing.
  Computing = 1 << 5,
  // Effect is currently enqueued in the scheduler.
  Scheduled = 1 << 6,
}

// Formal runtime invariants:
// - Freshness: node is fresh iff node.v >= max(source.t) across inbound edges.
// - Recompute correctness: after a successful recompute, node.v equals the
//   current epoch and dirty flags are cleared.
// - Single-pass guarantee: one ensureFresh pass must not recompute a node
//   more than once.
// - Topology guarantee: dirty sources must be refreshed before dependents.
//
// "Dirty" is a derived mask, not a stored bit:
// - Invalid => propagation hint only
// - Obsolete => confirmed stale by version check
// - Dirty => Invalid | Obsolete
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

export function isComputingState(state: number): boolean {
  return hasState(state, ReactiveNodeState.Computing);
}

export function isScheduledState(state: number): boolean {
  return hasState(state, ReactiveNodeState.Scheduled);
}

export function isCleanOrSignal(state: number, kind: ReactiveNodeKind) {
  return !hasState(state, DIRTY_STATE) && kind === ReactiveNodeKind.Signal;
}

export function isSignalKind(node: ReactiveNode): boolean {
  return node.kind === ReactiveNodeKind.Signal;
}

export function isEffectKind(node: ReactiveNode): boolean {
  return node.kind === ReactiveNodeKind.Effect;
}

export function markNodeComputing(node: ReactiveNode): void {
  node.state |= ReactiveNodeState.Computing;
}

export function clearNodeComputing(node: ReactiveNode): void {
  node.state &= ~ReactiveNodeState.Computing;
}

export function clearDirtyState(node: ReactiveNode): void {
  node.state &= ~DIRTY_STATE;
}

export function markNodeScheduled(node: ReactiveNode): void {
  node.state |= ReactiveNodeState.Scheduled;
}

export function clearNodeScheduled(node: ReactiveNode): void {
  node.state &= ~ReactiveNodeState.Scheduled;
}

// A graph edge means "to depends on from".
//
// Edges live in array-backed adjacency lists on both endpoints.
// `outIndex` and `inIndex` let us unlink in O(1) via swap-remove.
// `s` is updated during dependency tracking to keep live edges.
export class ReactiveEdge {
  s: number = 0;
  outIndex: number = -1;
  inIndex: number = -1;

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
  // Explicit semantic role. This is the primary extension seam for future
  // node kinds or alternate execution strategies.
  kind: ReactiveNodeKind;
  // Epoch when this node's observable value last changed.
  t: number;
  // Epoch when this node was last recomputed or confirmed fresh.
  v: number;
  // Bitset of ReactiveNodeState flags.
  state: number;
  // Derivation function for computeds/effects. Null for plain signals.
  compute: (() => unknown) | null;
  // Current cached value for this node.
  payload: unknown;
  // Tracking epoch for dependency retention during recompute.
  s: number;
  // Epoch-local worklist marker. Positive means queued for this pass, negative
  // means already popped once during this pass.
  w: number;
  // Outbound dependents: nodes that read from this node.
  readonly outgoing: ReactiveEdge[];
  // Inbound dependencies: nodes this node currently reads from.
  readonly incoming: ReactiveEdge[];
  // Fast path for repeated reads of the same source during tracking.
  lastTrackedEdge: ReactiveEdge | null;

  constructor(
    payload: unknown,
    compute: (() => unknown) | null,
    state: number,
    kind: ReactiveNodeKind,
  ) {
    this.kind = kind;
    this.t = 0;
    this.v = 0;
    this.state = state;
    this.compute = compute;
    this.payload = payload;
    this.s = 0;
    this.w = 0;
    this.outgoing = [];
    this.incoming = [];
    this.lastTrackedEdge = null;
  }
}

export function createSignalNode<T>(payload: T): ReactiveNode {
  return new ReactiveNode(payload, null, 0, ReactiveNodeKind.Signal);
}

export function createComputedNode(compute: () => unknown): ReactiveNode {
  return new ReactiveNode(
    undefined,
    compute,
    ReactiveNodeState.Invalid,
    ReactiveNodeKind.Computed,
  );
}

export function createEffectNode(compute: () => unknown): ReactiveNode {
  return new ReactiveNode(
    undefined,
    compute,
    ReactiveNodeState.Invalid | ReactiveNodeState.SideEffect,
    ReactiveNodeKind.Effect,
  );
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
  workEpoch: number = 0;
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
