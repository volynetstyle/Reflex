import ReactiveNode from "./ReactiveNode";

export type Byte32Int = number;

export const enum ReactiveNodeState {
  Producer = 1 << 0,
  Consumer = 1 << 1,
  Recycler = 1 << 2,
  
  Invalid = 1 << 3,
  Changed = 1 << 4,
  Visited = 1 << 5,
  Disposed = 1 << 6,
  Computing = 1 << 7,
  Scheduled = 1 << 8,
  Tracking = 1 << 9,
}

// export const MAYBE_CHANGE_STATE = ReactiveNodeState.Invalid;
// export const CHANGED_STATE = ReactiveNodeState.Changed;

export const DIRTY_STATE =
  ReactiveNodeState.Invalid | ReactiveNodeState.Changed;

export const PRODUCER_CHANGED =
  ReactiveNodeState.Producer | ReactiveNodeState.Changed;

export const PRODUCER_DIRTY = ReactiveNodeState.Producer | DIRTY_STATE;

export const CONSUMER_CHANGED =
  ReactiveNodeState.Invalid |
  ReactiveNodeState.Changed |
  ReactiveNodeState.Consumer;

export const RECYCLER_CHANGED =
  ReactiveNodeState.Changed | ReactiveNodeState.Recycler;

export const WALKER_STATE =
  ReactiveNodeState.Visited | ReactiveNodeState.Tracking;

export function markNodeComputing(node: ReactiveNode): void {
  node.state |= ReactiveNodeState.Computing;
}

export function clearNodeComputing(node: ReactiveNode): void {
  node.state &= ~ReactiveNodeState.Computing;
}

export function clearDirtyState(node: ReactiveNode): void {
  node.state &= ~DIRTY_STATE;
}
