export type FrameworkName = "alien" | "reflex";
export type Policy = "eager" | "batch";

export interface BenchSignal<T> {
  read(): T;
  write(value: T): void;
}

export interface BenchComputed<T> {
  read(): T;
}

export interface ReactiveBenchApi {
  signal<T>(initial: T): BenchSignal<T>;
  computed<T>(fn: () => T): BenchComputed<T>;
  effect(fn: () => void): () => void;
  batch<T>(fn: () => T): T;
  flush(): void;
  dispose(): void;
}

export interface WorkCounters {
  signalWrites: number;
  signalReads: number;
  computedRuns: number;
  effectRuns: number;
  checksum: number;
}

export interface WorkloadInstance {
  run(): void;
  counters(): WorkCounters;
  dispose(): void;
}

export type SuiteName = "vue-12349-exact" | "vue-12349-corrected" | "diagnostic";

export interface WorkloadDefinition {
  id: string;
  suite: SuiteName;
  sourceGroup: "computed" | "effect" | "ref" | "diagnostic";
  defaultSize?: number;
  supportedPolicies?: readonly Policy[];
  setup(api: ReactiveBenchApi, size: number, policy: Policy): WorkloadInstance;
}
