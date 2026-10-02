/// <reference lib="dom" preserve="true" />

import type { AsyncBlocker } from "./errors";

/** A successful publication. Presence is independent of the value being undefined. */
export interface AsyncCommit<T> {
  readonly value: T;
  readonly version: number;
  readonly token: number;
}

/** Tentative work has its own lifetime; it never overwrites a committed value. */
export interface AsyncAttempt {
  readonly token: number;
  readonly signal: AbortSignal;
  readonly blocker: AsyncBlocker | undefined;
  alive(): boolean;
}

export interface AsyncExecution {
  readonly signal: AbortSignal;
  readonly attempt: AsyncAttempt;
  /** Capture reactive inputs before the first await. A pending source blocks this execution. */
  read<T>(source: AsyncSource<T>): T;
  /** Read committed truth, preserving the distinction between absence and committed undefined. */
  commit<T>(source: AsyncSource<T>): AsyncCommit<T> | undefined;
}

export interface AsyncOptions {
  /** Bind the whole derivation to an owner, e.g. the framework's useAbortSignal(). */
  readonly signal?: AbortSignal;
}

export interface AsyncSource<T> {
  readonly read: () => T;
  /** Convenience value projection. Use commit() when presence matters. */
  readonly currentOrUndefined: () => T | undefined;
  readonly commit: () => AsyncCommit<T> | undefined;
  readonly attempt: () => AsyncAttempt | undefined;
  /** Data failure, if any. Protocol violations throw instead of becoming data errors. */
  readonly error: () => unknown;
  resolve(options?: AsyncOptions): Promise<T>;
  refresh(): void;
  dispose(): void;
  [Symbol.dispose](): void;
}

export type AsyncJob<T> = (execution: AsyncExecution) => T | PromiseLike<T>;
