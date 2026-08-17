import type {
  BenchComputed,
  BenchSignal,
  Policy,
  ReactiveBenchApi,
  WorkCounters,
  WorkloadInstance,
} from "../types.js";

export function createCounters(): WorkCounters {
  return {
    signalWrites: 0,
    signalReads: 0,
    computedRuns: 0,
    effectRuns: 0,
    checksum: 0,
  };
}

export function trackedSignal<T>(
  api: ReactiveBenchApi,
  counters: WorkCounters,
  initial: T,
): BenchSignal<T> {
  const value = api.signal(initial);
  return {
    read() {
      counters.signalReads++;
      return value.read();
    },
    write(next) {
      counters.signalWrites++;
      value.write(next);
    },
  };
}

export function trackedComputed<T>(
  api: ReactiveBenchApi,
  counters: WorkCounters,
  fn: () => T,
): BenchComputed<T> {
  return api.computed(() => {
    counters.computedRuns++;
    return fn();
  });
}

export function trackedEffect(
  api: ReactiveBenchApi,
  counters: WorkCounters,
  fn: () => void,
): () => void {
  return api.effect(() => {
    counters.effectRuns++;
    fn();
  });
}

export function runWithPolicy(
  api: ReactiveBenchApi,
  policy: Policy,
  fn: () => void,
): void {
  if (policy === "batch") api.batch(fn);
  else fn();
}

export function instance(
  api: ReactiveBenchApi,
  counters: WorkCounters,
  run: () => void,
  extraDispose?: () => void,
): WorkloadInstance {
  return {
    run,
    counters: () => ({ ...counters }),
    dispose() {
      extraDispose?.();
      api.dispose();
    },
  };
}
