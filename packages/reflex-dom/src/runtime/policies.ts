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

export interface UpdateScheduler {
  schedule(fn: () => void): void;
  flush(): void;
}

export function createDefaultPolicyConfig(): PolicyConfig {
  return {
    effectPolicy: ExecutionPolicy.Eager,
    batchUpdates: false,
    priorityLevels: false,
  };
}

export function resolveEffectStrategy(
  policy: ExecutionPolicy = ExecutionPolicy.Eager,
  _priorityLevels = false,
): EffectStrategy {
  if (policy === ExecutionPolicy.Eager) return "eager";
  if (policy === ExecutionPolicy.Batch) return "sab";
  return "flush";
}

export function createUpdateScheduler(): UpdateScheduler {
  let scheduled = false;
  let head = 0;
  const queue: Array<() => void> = [];

  function flush(): void {
    if (head >= queue.length) {
      return;
    }

    while (head < queue.length) {
      queue[head++]!();
    }

    queue.length = 0;
    head = 0;
  }

  return {
    schedule(fn) {
      queue.push(fn);

      if (scheduled) {
        return;
      }

      scheduled = true;
      Promise.resolve().then(() => {
        scheduled = false;
        flush();
      });
    },

    flush,
  };
}
