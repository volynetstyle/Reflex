import type { EffectStrategy } from "@volynets/reflex-scheduler";

export const enum ExecutionPolicy {
  Eager = "eager",
  Batch = "batch",
  Lazy = "lazy",
  Post = "post",
}

export interface PolicyConfig {
  effectPolicy: ExecutionPolicy;
  batchUpdates: boolean;
  priorityLevels: boolean;
}

export function resolveEffectStrategy(
  policy: ExecutionPolicy = ExecutionPolicy.Eager,
  _priorityLevels = false,
): EffectStrategy {
  if (policy === ExecutionPolicy.Eager) return "eager";
  if (policy === ExecutionPolicy.Batch) return "sab";
  return "flush";
}
