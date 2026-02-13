// Main public API
// and never out the alternatives its bit different
export {
  // Anomalies exist and do not cause any errors except errors.
  // This is a significant difference, because in our execution conditions, errors are unnatural.
  // There is no point in denying them, you can only learn to coexist with them.
  DependencyCycleAnomaly,
  IllegalWriteDuringComputeAnomaly,
  StaleVersionCommitAnomaly,
  ReentrantExecutionAnomaly,
  DisposedNodeAccessAnomaly,
  SelectorKeyInstabilityAnomaly,
  PriorityInversionAnomaly,
  ScopeLeakAnomaly,
  
  // ownership
  createScope,
  // 1 primitives
  signal,
  realtime,
  stream,
  resource,
  suspense,

  // 2 derived of signal
  memo,
  computed,
  derived,

  // 3 other
  effect,
  selector,
  projection,

  clutch 
} from "./main";

export type {
  Ownership,
  OwnerContext,
  Owner,
  SignalConfig,
  SignalContext,
  Signal,
  Computed,
  EffectFn,
  Accessor,
  Setter,
} from "./main";

