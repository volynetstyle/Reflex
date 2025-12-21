// Main public API
// and never out the alternatives its bit different
export {
  // Anomalies exist and do not cause any errors except errors.
  // This is a significant difference, because in our execution conditions, errors are unnatural.
  // There is no point in denying them, you can only learn to coexist with them.
  ContextNotFoundAnomaly,
  NoOwnerAnomaly,
  // ownership
  createScope,
  // primitives
  signal,
  computed,
  derived,
  effect,
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
