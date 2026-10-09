/// <reference lib="dom" preserve="true" />
/// <reference lib="esnext.disposable" preserve="true" />

import { untracked } from "@volynets/reflex-runtime/internal";
import { AsyncBlocker } from "./async/errors";
import { AsyncCore } from "./async/source";
import { waitForChange } from "./async/wait";
import type { AsyncJob, AsyncOptions, AsyncSource } from "./async/types";

export { AsyncCore };
export {
  AsyncBlocker,
  AsyncDisposedError,
  AsyncProtocolError,
} from "./async/errors";
export type {
  AsyncAttempt,
  AsyncCommit,
  AsyncExecution,
  AsyncJob,
  AsyncOptions,
  AsyncSource,
} from "./async/types";

/** Reactive async work over the synchronous runtime. Dependencies are captured before await. */
export function asyncDerived<T>(
  job: AsyncJob<T>,
  options: AsyncOptions = {},
): AsyncSource<T> {
  return new AsyncCore(job, options);
}

export function read<T>(source: AsyncSource<T>): T {
  return source.read();
}

/** Value convenience accessor; commit() is the presence-preserving interface. */
export function currentOrUndefined<T>(source: AsyncSource<T>): T | undefined {
  return source.currentOrUndefined();
}

export function isLoading(source: AsyncSource<unknown>): boolean {
  const { commit, attempt } = source.snapshot();
  return commit === undefined && attempt !== undefined;
}

export function isUpdating(source: AsyncSource<unknown>): boolean {
  const { commit, attempt } = source.snapshot();
  return commit !== undefined && attempt !== undefined;
}
/** Pending relative to the reads performed by an expression; ordinary errors propagate. */
export function pending(expression: () => unknown): boolean {
  try {
    expression();
    return false;
  } catch (error) {
    if (error instanceof AsyncBlocker) return true;
    throw error;
  }
}

/** Wait for a fresh result, following superseding attempts instead of an old promise. */
export async function until<T>(
  source: AsyncSource<T>,
  { signal }: AsyncOptions = {},
): Promise<T> {
  while (true) {
    signal?.throwIfAborted();

    try {
      return untracked(() => source.read());
    } catch (error) {
      if (!(error instanceof AsyncBlocker)) throw error;

      await waitForChange(error.promise, signal);
    }
  }
}
