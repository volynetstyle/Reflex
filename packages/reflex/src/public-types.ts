export interface EngineHooks {
  onEffectInvalidated?(node: unknown): void;
}

export type EffectStrategy = "flush" | "eager";

export interface Signal<T> {
  readonly node: unknown;
  read(): T;
  write(value: T): void;
}

export interface Computed<T> {
  readonly node: unknown;
  (): T;
}

export interface EffectScope {
  readonly node: unknown;
  dispose(): void;
}

export type BatchWriteEntry = readonly [Signal<unknown>, unknown];

export interface RuntimeOptions {
  hooks?: EngineHooks;
  effectStrategy?: EffectStrategy;
}

export interface Runtime {
  signal<T>(value: T): Signal<T>;
  computed<T>(fn: () => T): Computed<T>;
  memo<T>(fn: () => T): Computed<T>;
  effect(fn: () => void | (() => void)): EffectScope;
  flush(): void;
  batchWrite(writes: ReadonlyArray<BatchWriteEntry>): void;
  readonly ctx: unknown;
}
