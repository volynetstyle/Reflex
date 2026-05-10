import "./debug/dev_flag";
export { subtle, type RuntimeSubtle } from "./subtle";
export {
  RUNTIME_DEBUG_PROTOCOL_VERSION,
  type RuntimeDebugCommand,
  type RuntimeDebugGraphDirection,
  type RuntimeDebugGraphEdgeSnapshot,
  type RuntimeDebugGraphIntegrity,
  type RuntimeDebugGraphIssue,
  type RuntimeDebugGraphOptions,
  type RuntimeDebugGraphSnapshot,
  type RuntimeDebugHandshake,
  type RuntimeDebugMessage,
  type RuntimeDebugMessageListener,
  type RuntimeDebugProtocolVersion,
  type RuntimeDebugSession,
  type RuntimeDebugSessionSnapshot,
} from "./debug/debug.protocol";

export {
  readProducer,
  writeProducer,
  //
  readConsumer,
  readConsumerLazy,
  readConsumerEager,
  //
  ConsumerReadMode,
  //
  watcher,
  runWatcher,
  disposeWatcher,
  //
  untracked,
} from "./protocol";
export type { ProducerComparator } from "./protocol";

// Execution context management
export {
  getActiveConsumer,
  getSinkInvalidatedHook,
  getPropagationDepth,
  setPropagationDepth,
  setSinkInvalidatedHook,
  setReactiveSettledHook,
  getReactiveSettledHook,
  setHooks,
  setRuntimeHooks,
  setOptions,
  saveContext,
  restoreContext,
  resetState,
  notifySettledIfIdle,
  notifySinkInvalidated,
  dispatchSinkInvalidated,
  type ExecutionContextOptions,
  type EngineHooks,
  type TrackReadFallback,
} from "./reactivity/context";

export {
  DIRTY_STATE,
  //
  PRODUCER_INITIAL_STATE,
  PRODUCER_CHANGED,
  PRODUCER_DIRTY,
  //
  CONSUMER_CHANGED as CONSUMER_INITIAL_STATE,
  CONSUMER_CHANGED,
  CONSUMER_DIRTY,
  //
  WATCHER_CHANGED as WATCHER_INITIAL_STATE,
  WATCHER_CHANGED,
  //
  WALKER_STATE,
  //
  ReactiveNode,
  ReactiveEdge,
  Producer,
  Consumer,
  Watcher,
  Invalid,
  Changed,
  Reentrant,
  Scheduled,
  Computing,
  Tracking,
  disposeNode,
  disposeNodeEvent,
} from "./reactivity";

export type { ReactiveNodeState } from "./reactivity";
