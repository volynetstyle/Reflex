import ReactiveNode from "./ReactiveNode";
import runtime, { type EngineContext } from "../../runtime";

export type Byte32Int = number;

export const enum ReactiveNodeState {
  Invalid = 1 << 0,
  Obsolete = 1 << 1,
  Tracking = 1 << 2,
  SideEffect = 1 << 3,
  Ordered = 1 << 4,
  Disposed = 1 << 5,
  Computing = 1 << 6,
  Scheduled = 1 << 7,
  Queued = Scheduled,
}

export const DIRTY_STATE =
  ReactiveNodeState.Invalid | ReactiveNodeState.Obsolete;
export const TRACKING_STATE = ReactiveNodeState.Tracking;

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
    ReactiveNodeState.Invalid,
    ReactiveNodeKind.Computed,
  );
}

export function createEffectNode(
  compute: () => void | (() => void),
): ReactiveNode<void | (() => void)> {
  return new ReactiveNode(
    undefined,
    compute,
    ReactiveNodeState.Invalid | ReactiveNodeState.SideEffect,
    ReactiveNodeKind.Effect,
  );
}
