import "./debug/dev_flag";

export {
  readProducer,
  writeProducer,
  readConsumer,
  readConsumerLazy,
  readConsumerEager,
  runWatcher,
  disposeWatcher,
  ConsumerReadMode,
  untracked,
} from "./api";
export type { ProducerComparator } from "./api";

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
  ReactiveNodeState,
  isDisposedNode,
  disposeNode,
  disposeNodeEvent,
} from "./reactivity";
