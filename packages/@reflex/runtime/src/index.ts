import "./dev_flag";

export {
  readProducer,
  writeProducer,
  readConsumer,
  readConsumerLazy,
  readConsumerEager,
  runWatcher,
  disposeWatcher,
  ProducerComparator,
  ConsumerReadMode,
  untracked,
} from "./api";

// Execution context management
export {
  getActiveComputed,
  getEffectInvalidatedHook,
  getPropagationDepth,
  setPropagationDepth,
  createExecutionContext,
  getDefaultContext,
  getReactiveSettledHook,
  setDefaultContext,
  setEffectInvalidatedHook,
  setReactiveSettledHook,
  resetDefaultContext,
  type ExecutionContext,
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
