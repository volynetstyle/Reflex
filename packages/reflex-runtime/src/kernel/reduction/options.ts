import type {
  GraphReductionOptions,
  NormalizedGraphReductionOptions,
} from "./types";

export const DEFAULT_GRAPH_REDUCTION_OPTIONS: NormalizedGraphReductionOptions =
  {
    enabled: false,
    stableThreshold: 3,
    specializeThreshold: 6,
    staticPlanThreshold: 12,
    deoptAfterMismatch: 1,
    cooldownAfterDeopt: 16,
  };

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

export function normalizeGraphReductionOptions(
  options: GraphReductionOptions | boolean | undefined,
  fallback: NormalizedGraphReductionOptions = DEFAULT_GRAPH_REDUCTION_OPTIONS,
): NormalizedGraphReductionOptions {
  if (options === true) {
    return { ...fallback, enabled: true };
  }

  if (options === false || options === undefined) {
    return {
      ...fallback,
      enabled: options === false ? false : fallback.enabled,
    };
  }

  const stableThreshold = normalizePositiveInteger(
    options.stabilizeAfter ?? options.stableThreshold,
    fallback.stableThreshold,
  );
  const specializeThreshold = Math.max(
    stableThreshold,
    normalizePositiveInteger(
      options.specializeThreshold,
      fallback.specializeThreshold,
    ),
  );
  const staticPlanThreshold = Math.max(
    specializeThreshold,
    normalizePositiveInteger(
      options.staticPlanThreshold,
      fallback.staticPlanThreshold,
    ),
  );

  return {
    enabled: options.enabled ?? fallback.enabled,
    stableThreshold,
    specializeThreshold,
    staticPlanThreshold,
    deoptAfterMismatch: normalizePositiveInteger(
      options.deoptAfterMismatch,
      fallback.deoptAfterMismatch,
    ),
    cooldownAfterDeopt: normalizePositiveInteger(
      options.cooldownAfterDeopt,
      fallback.cooldownAfterDeopt,
    ),
  };
}
