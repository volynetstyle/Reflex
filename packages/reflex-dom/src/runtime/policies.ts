import type { createRuntime } from "@volynets/reflex";

type RuntimeEffectStrategy = NonNullable<
  Parameters<typeof createRuntime>[0]
>["effectStrategy"];

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
): RuntimeEffectStrategy {
  return policy === ExecutionPolicy.Eager ? "eager" : "flush";
}

export function createUpdateScheduler(): UpdateScheduler {
  let scheduled = false;
  const queue: Array<() => void> = [];

  function flush(): void {
    if (queue.length === 0) {
      return;
    }

    const batch = queue.splice(0);

    for (let i = 0; i < batch.length; i++) {
      batch[i]!();
    }
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
