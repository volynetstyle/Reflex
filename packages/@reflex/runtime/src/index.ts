import "./debug/dev_flag";

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
  withCleanupRegistrar,
  registerWatcherCleanup,
  notifySettledIfIdle,
  notifySinkInvalidated,
  dispatchSinkInvalidated,
  type ExecutionContextOptions,
  type EngineHooks,
  type CleanupRegistrar,
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
  Disposed,
  Scheduled,
  Computing,
  Tracking,
  isDisposedNode,
  disposeNode,
  disposeNodeEvent,
} from "./reactivity";

export type { ReactiveNodeState } from "./reactivity";
