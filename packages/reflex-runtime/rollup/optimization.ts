import type { GeneratedCodeOptions, RollupTreeshakeOptions } from "./types.ts";

/**
 * Only keep helpers here when they are truly observationally pure:
 * - no writes;
 * - no getters/setters touched;
 * - no throwing by design;
 * - no dependency on ambient mutable state.
 *
 * Do NOT put Object.defineProperty/Object.freeze here. They are observable and
 * dropping them can erase runtime metadata, brands, descriptors, or validation.
 */
export const VERIFIED_PURE_FUNCS = [
  "hasState",
  "isDirtyState",
  "isPendingState",
  "isChangedState",
  "isObsoleteState",
  "isTrackingState",
  "isVisitedState",
  "isComputingState",
  "isScheduledState",
  "isSignalKind",
  "isEffectKind",
] as const;

/**
 * Conservative tree-shaking: preserve observable JS semantics first.
 * The older config used several optimistic flags that are fast but unsafe for
 * getters, unknown globals, try/catch and module side effects.
 */
export const SAFE_TREESHAKE_OPTIONS: RollupTreeshakeOptions = {
  preset: "recommended",
  moduleSideEffects: true,
  propertyReadSideEffects: true,
  tryCatchDeoptimization: true,
  correctVarValueBeforeDeclaration: true,
  unknownGlobalSideEffects: true,
};

export const GENERATED_CODE_OPTIONS: GeneratedCodeOptions = {
  constBindings: true,
  arrowFunctions: true,
  symbols: true,
};
