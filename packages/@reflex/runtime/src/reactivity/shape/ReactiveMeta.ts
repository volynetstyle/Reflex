import type ReactiveNode from "./ReactiveNode";

export enum ReactiveNodeState {
  Producer = 1 << 0,
  Consumer = 1 << 1,
  Watcher = 1 << 2,

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

export const PRODUCER_INITIAL_STATE = ReactiveNodeState.Producer;

export const PRODUCER_CHANGED =
  ReactiveNodeState.Producer | ReactiveNodeState.Changed;

export const PRODUCER_DIRTY = ReactiveNodeState.Producer | DIRTY_STATE;

export const CONSUMER_CHANGED =
  ReactiveNodeState.Changed | ReactiveNodeState.Consumer;

export const CONSUMER_DIRTY = ReactiveNodeState.Consumer | DIRTY_STATE;

export const WATCHER_CHANGED =
  ReactiveNodeState.Changed | ReactiveNodeState.Watcher;

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

export function isDisposedNode(node: ReactiveNode): boolean {
  return (node.state & ReactiveNodeState.Disposed) !== 0;
}
