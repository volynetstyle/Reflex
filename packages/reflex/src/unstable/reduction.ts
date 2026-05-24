import {
  restoreContext,
  saveContext,
  setRuntimeContextOptions,
  type GraphReductionOptions,
} from "@volynets/reflex-runtime/internal";

export type {
  GraphReductionMode,
  GraphReductionOptions,
} from "@volynets/reflex-runtime/internal";

let activeReductionOptions: GraphReductionOptions | undefined;

function enableReductionForRun<T>(
  fn: () => T,
  options: GraphReductionOptions,
): T {
  const snapshot = saveContext();

  setRuntimeContextOptions({
    graphReductionPolicy: {
      ...options,
      enabled: true,
    },
  });

  try {
    return fn();
  } finally {
    restoreContext(snapshot);
  }
}

export function getActiveReductionOptions(): GraphReductionOptions | undefined {
  return activeReductionOptions;
}

export function specialize<T>(
  fn: () => T,
  options: GraphReductionOptions = {},
): T {
  const prev = activeReductionOptions;
  activeReductionOptions = {
    ...options,
    enabled: true,
  };

  try {
    return enableReductionForRun(fn, activeReductionOptions);
  } finally {
    activeReductionOptions = prev;
  }
}

export function statify<T>(
  factory: () => T,
  options?: GraphReductionOptions,
): T;
export function statify<T>(model: T, options?: GraphReductionOptions): T;
export function statify<T>(
  modelOrFactory: T | (() => T),
  options: GraphReductionOptions = {},
): T {
  return specialize(
    () => {
      if (typeof modelOrFactory === "function") {
        return (modelOrFactory as () => T)();
      }

      return modelOrFactory;
    },
    {
      stableThreshold: 1,
      specializeThreshold: 1,
      staticPlanThreshold: 1,
      ...options,
      enabled: true,
    },
  );
}
