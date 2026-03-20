import type ReactiveNode from "./ReactiveNode";

export type Byte32Int = number;

export const enum ReactiveNodeKind {
  Signal = 0,
  Computed = 1,
  Effect = 2,
  Producer = Signal,
  Consumer = Computed,
  Recycler = Effect,
}

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

export function markNodeComputing(node: ReactiveNode): void {
  node.state |= ReactiveNodeState.Computing;
}

export function clearNodeComputing(node: ReactiveNode): void {
  node.state &= ~ReactiveNodeState.Computing;
}

export function clearDirtyState(node: ReactiveNode): void {
  node.state &= ~DIRTY_STATE;
}
