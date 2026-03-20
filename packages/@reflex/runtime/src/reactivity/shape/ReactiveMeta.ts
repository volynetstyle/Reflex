import type ReactiveNode from "./ReactiveNode";

export type Byte32Int = number;

export const enum ReactiveNodeState {
  Invalid = 1 << 0,
  Changed = 1 << 1,
  SideEffect = 1 << 3,
  Visited = 1 << 4,
  Disposed = 1 << 5,
  Computing = 1 << 6,
  Scheduled = 1 << 7,
  Tracking = 1 << 8,
}

export const MAYBE_CHANGE_STATE = ReactiveNodeState.Invalid;
export const CHANGED_STATE = ReactiveNodeState.Changed;
export const DIRTY_STATE = MAYBE_CHANGE_STATE | CHANGED_STATE;

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
  return (state & DIRTY_STATE) !== 0;
}

export function isPendingState(state: number): boolean {
  return (state & MAYBE_CHANGE_STATE) !== 0;
}

export function isChangedState(state: number): boolean {
  return (state & CHANGED_STATE) !== 0;
}

export function isObsoleteState(state: number): boolean {
  return (state & CHANGED_STATE) !== 0;
}

export function isDisposedState(state: number): boolean {
  return (state & ReactiveNodeState.Disposed) !== 0;
}

export function isVisitedState(state: number): boolean {
  return (state & ReactiveNodeState.Visited) !== 0;
}

export function isComputingState(state: number): boolean {
  return (state & ReactiveNodeState.Computing) !== 0;
}

export function isScheduledState(state: number): boolean {
  return (state & ReactiveNodeState.Scheduled) !== 0;
}

export function isTrackingState(state: number): boolean {
  return (state & ReactiveNodeState.Tracking) !== 0;
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
