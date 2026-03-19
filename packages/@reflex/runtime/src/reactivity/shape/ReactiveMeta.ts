import ReactiveNode from "./ReactiveNode";
import runtime, { type EngineContext } from "../../runtime";

export type Byte32Int = number;

export const enum ReactiveNodeState {
  Pending = 1 << 0,
  Invalid = Pending,
  Changed = 1 << 1,
  Obsolete = Changed,
  Tracking = 1 << 2,
  SideEffect = 1 << 3,
  PropagationVisited = 1 << 4,
  Recursed = PropagationVisited,
  Disposed = 1 << 5,
  Computing = 1 << 6,
  Scheduled = 1 << 7,
  DependencyTracking = 1 << 8,
  RecursedCheck = DependencyTracking,
  Queued = Scheduled,
}

export const PENDING_STATE = ReactiveNodeState.Pending;
export const CHANGED_STATE = ReactiveNodeState.Changed;
export const DIRTY_STATE = PENDING_STATE | CHANGED_STATE;
export const TRACKING_STATE = ReactiveNodeState.Tracking;
export const PROPAGATION_VISITED_STATE = ReactiveNodeState.PropagationVisited;
export const DEPENDENCY_TRACKING_STATE = ReactiveNodeState.DependencyTracking;
export const ACTIVE_PROPAGATION_STATE =
  DIRTY_STATE |
  PROPAGATION_VISITED_STATE |
  DEPENDENCY_TRACKING_STATE;
export const PROPAGATION_REVISIT_STATE =
  PROPAGATION_VISITED_STATE |
  DEPENDENCY_TRACKING_STATE;
export const PROPAGATION_CURSOR_STATE = PROPAGATION_REVISIT_STATE;

export const enum ReactiveNodeKind {
  Signal = 0,
  Computed = 1,
  Effect = 2,
  Producer = Signal,
  Consumer = Computed,
  Recycler = Effect,
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

export function isPendingState(state: number): boolean {
  return hasState(state, PENDING_STATE);
}

export function isChangedState(state: number): boolean {
  return hasState(state, CHANGED_STATE);
}

export function isObsoleteState(state: number): boolean {
  return isChangedState(state);
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

export function getNodeContext(node: ReactiveNode): EngineContext {
  void node;
  return runtime;
}

export function createSignalNode<T>(
  payload: T,
): ReactiveNode<T> {
  return new ReactiveNode(payload, null, 0, ReactiveNodeKind.Signal);
}

export function createComputedNode<T>(
  compute: () => T,
): ReactiveNode<T> {
  return new ReactiveNode(
    undefined,
    compute,
    PENDING_STATE,
    ReactiveNodeKind.Computed,
  );
}

export function createEffectNode(
  compute: () => void | (() => void),
): ReactiveNode<void | (() => void)> {
  return new ReactiveNode(
    undefined,
    compute,
    PENDING_STATE | ReactiveNodeState.SideEffect,
    ReactiveNodeKind.Effect,
  );
}
