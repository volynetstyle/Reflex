/// <reference lib="dom" preserve="true" />

import {
  Both,
  disposeWatcher,
  enterReactiveBatch,
  getActiveRuntimeContext,
  leaveReactiveBatch,
  readConsumerLazy,
  readProducer,
  runWatcher,
  runWithRuntimeContext,
  untracked,
  writeProducer,
} from "@volynets/reflex-runtime/internal";
import {
  createAccumulator,
  createComputedNode,
  createResourceStateNode,
  createWatcherNode,
} from "../../src/factory";

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

/** A synchronous read could not produce a fresh value. The promise wakes on a source change. */
export class AsyncBlocker extends Error {
  constructor(
    readonly source: AsyncSource<unknown>,
    readonly promise: Promise<void>,
  ) {
    super("An async derivation has no fresh result yet.");
    this.name = "AsyncBlocker";
  }
}

export class AsyncDisposedError extends Error {
  constructor() {
    super("The async derivation has been disposed.");
    this.name = "AsyncDisposedError";
  }
}

/** Programmer misuse of the execution protocol, distinct from async data failure. */
export class AsyncProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsyncProtocolError";
  }
}

/** Only sources whose fresh executions must be validated, never ordinary reactive nodes. */
interface AsyncDependency {
  ensure(): void;
}

interface ExecutionTracking {
  add(dependency: AsyncDependency): void;
}

// Dynamic context is synchronous. Async continuations use an explicit captured handle.
let activeExecution: ExecutionTracking | null = null;

type Outcome =
  | { readonly kind: "ready" }
  | { readonly kind: "failure"; readonly error: unknown }
  | { readonly kind: "disposed" };

export type AsyncJob<T> = (execution: AsyncExecution) => T | PromiseLike<T>;

class Attempt implements AsyncAttempt {
  readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  blocker: AsyncBlocker | undefined;
  // Cache one revision's notification; public reads promote it to a reusable blocker.
  readCache: Promise<void> | AsyncBlocker | undefined;

  constructor(
    readonly token: number,
    private readonly isCurrent: () => boolean,
  ) {}

  alive(): boolean {
    return !this.signal.aborted && this.isCurrent();
  }
}

class AsyncCore<T> implements AsyncSource<T>, AsyncDependency {
  private readonly runtime = getActiveRuntimeContext();
  private readonly commitNode = createAccumulator<AsyncCommit<T> | undefined>(
    undefined,
  );
  private readonly stateNode = createResourceStateNode();
  private readonly refreshNode = createResourceStateNode();
  private readonly valueNode = createComputedNode(
    () => readProducer(this.commitNode)?.value,
  );
  private readonly watcher = createWatcherNode(() => this.execute());
  private dependencies = new Set<AsyncDependency>();
  private activeAttempt: Attempt | undefined;
  private outcome: Outcome = { kind: "ready" };
  private token = 0;
  private validating = false;
  private wake: (() => void) | undefined;
  private changed: Promise<void> | undefined;

  constructor(
    private readonly job: AsyncJob<T>,
    private readonly options: AsyncOptions,
  ) {
    if (options.signal?.aborted) {
      this.dispose();
    } else {
      options.signal?.addEventListener("abort", this.onAbort, { once: true });
      this.ensure();
    }
  }

  private readonly onAbort = (): void => this.dispose();

  private within<R>(fn: () => R): R {
    return runWithRuntimeContext(this.runtime, () => {
      enterReactiveBatch();
      try {
        return fn();
      } finally {
        leaveReactiveBatch();
      }
    });
  }

  ensure(): void {
    if (this.outcome.kind === "disposed") return;
    if (this.validating)
      throw new AsyncProtocolError("Cyclic async derivation dependency.");
    if (
      this.activeAttempt === undefined &&
      (this.watcher.state & Both) === 0 &&
      getActiveRuntimeContext() === this.runtime
    ) {
      // Clean committed reads avoid context closures, but still pull upstream,
      // run the watcher checkpoint and leave the same reactive batch boundary.
      enterReactiveBatch();
      this.validating = true;
      try {
        if (this.dependencies.size !== 0) untracked(this.pullDependencies);
        runWatcher(this.watcher);
      } finally {
        this.validating = false;
        leaveReactiveBatch();
      }
      return;
    }
    this.within(() => {
      this.validating = true;
      try {
        untracked(() => {
          for (const dependency of this.dependencies) dependency.ensure();
        });
        runWatcher(this.watcher);
      } finally {
        this.validating = false;
      }
    });
  }

  private readonly pullDependencies = (): void => {
    for (const dependency of this.dependencies) dependency.ensure();
  };

  readonly currentOrUndefined = readConsumerLazy.bind(this.valueNode) as () =>
    | T
    | undefined;

  readonly commit = (): AsyncCommit<T> | undefined =>
    readProducer(this.commitNode);

  readonly attempt = (): AsyncAttempt | undefined => {
    this.ensure();
    readProducer(this.stateNode);
    return this.activeAttempt;
  };

  readonly error = (): unknown => {
    this.ensure();
    readProducer(this.stateNode);
    if (
      this.outcome.kind === "failure" &&
      this.outcome.error instanceof AsyncProtocolError
    ) {
      throw this.outcome.error;
    }
    return this.outcome.kind === "failure" ? this.outcome.error : undefined;
  };

  private readFreshCommit(): AsyncCommit<T> | undefined {
    activeExecution?.add(this);
    this.ensure();
    readProducer(this.stateNode);
    if (this.outcome.kind === "disposed") throw new AsyncDisposedError();
    if (this.activeAttempt !== undefined) return undefined;
    if (this.outcome.kind === "failure") throw this.outcome.error;
    return readProducer(this.commitNode);
  }

  readonly read = (): T => {
    const commit = this.readFreshCommit();
    if (commit !== undefined) return commit.value;
    if (this.activeAttempt !== undefined) {
      const attempt = this.activeAttempt;
      if (!(attempt.readCache instanceof AsyncBlocker)) {
        attempt.readCache = new AsyncBlocker(this, this.whenReadChanges());
      }
      throw attempt.readCache;
    }
    throw new AsyncBlocker(this, this.whenChanged());
  };

  refresh(): void {
    if (this.outcome.kind === "disposed") return;
    this.within(() => {
      writeProducer(this.refreshNode, this.refreshNode.payload + 1);
      this.ensure();
    });
  }

  async resolve(options: AsyncOptions = {}): Promise<T> {
    while (true) {
      if (options.signal?.aborted) throw options.signal.reason;
      let commit: AsyncCommit<T> | undefined;
      let changed: Promise<void> | undefined;
      try {
        changed = untracked(() => {
          commit = this.readFreshCommit();
          return commit === undefined ? this.whenReadChanges() : undefined;
        });
      } catch (error) {
        // Watcher validation can itself block before the loader runs.
        if (!(error instanceof AsyncBlocker)) throw error;
        changed = error.promise;
      }
      if (changed === undefined) return commit!.value;
      await waitForChange(changed, options.signal);
    }
  }

  dispose(): void {
    if (this.outcome.kind === "disposed") return;
    this.within(() => {
      const previous = this.activeAttempt;
      this.activeAttempt = undefined;
      this.outcome = { kind: "disposed" };
      this.options.signal?.removeEventListener("abort", this.onAbort);
      disposeWatcher(this.watcher);
      this.dependencies.clear();
      this.notify();
      // Revoke commit authority before invoking user abort listeners.
      previous?.controller.abort();
    });
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  private whenChanged(): Promise<void> {
    return (this.changed ??= new Promise<void>((resolve) => {
      this.wake = resolve;
    }));
  }

  private whenReadChanges(): Promise<void> {
    const attempt = this.activeAttempt;
    if (attempt === undefined) return this.whenChanged();
    if (attempt.readCache === undefined) {
      const changed = this.whenChanged();
      const blocker = attempt.blocker;
      attempt.readCache =
        blocker === undefined
          ? changed
          : Promise.race([changed, blocker.promise]);
    }
    return attempt.readCache instanceof AsyncBlocker
      ? attempt.readCache.promise
      : attempt.readCache;
  }

  private notify(): void {
    const wake = this.wake;
    this.wake = undefined;
    this.changed = undefined;
    if (this.activeAttempt !== undefined) {
      this.activeAttempt.readCache = undefined;
    }
    writeProducer(this.stateNode, this.stateNode.payload + 1);
    wake?.();
  }

  private execute(): void {
    readProducer(this.refreshNode);

    const previous = this.activeAttempt;
    const attempt: Attempt = new Attempt(
      ++this.token,
      () => this.activeAttempt === attempt,
    );

    this.activeAttempt = attempt;
    this.outcome = { kind: "ready" };
    this.dependencies = new Set();

    const tracking: ExecutionTracking = {
      add: (dependency) => {
        if (dependency === this)
          throw new AsyncProtocolError("Cyclic async derivation dependency.");
        this.dependencies.add(dependency);
      },
    };
    const checkTracking = (): void => {
      if (activeExecution !== tracking) {
        throw new AsyncProtocolError(
          "Capture reactive async inputs before await; AsyncExecution.read/commit are synchronous.",
        );
      }
    };

    const execution: AsyncExecution = {
      signal: attempt.signal,
      attempt,
      read: (source) => {
        checkTracking();
        return source.read();
      },
      commit: (source) => {
        checkTracking();
        return source.commit();
      },
    };

    const parent = activeExecution;
    activeExecution = tracking;

    try {
      untracked(() => previous?.controller.abort());
      this.notify();
      if (!attempt.alive()) return;
      const result = this.job(execution);
      // Inspect thenables inside the execution error boundary, including throwing getters.
      if (
        result !== null &&
        (typeof result === "object" || typeof result === "function") &&
        typeof (result as PromiseLike<T>).then === "function"
      ) {
        void Promise.resolve(result).then(
          (value) => this.finish(attempt, { kind: "value", value }),
          (error: unknown) => this.finish(attempt, { kind: "error", error }),
        );
      } else {
        this.publish(attempt, { kind: "value", value: result as T });
      }
    } catch (error) {
      this.publish(attempt, { kind: "error", error });
    } finally {
      activeExecution = parent;
    }
  }

  private finish(attempt: Attempt, result: Result<T>): void {
    if (!attempt.alive()) return;
    this.within(() => {
      // A dependency may have changed between promise settlement and a scheduler flush.
      untracked(() => this.ensure());
      this.publish(attempt, result);
    });
  }

  private publish(attempt: Attempt, result: Result<T>): void {
    if (!attempt.alive()) return;
    if (result.kind === "error" && result.error instanceof AsyncBlocker) {
      attempt.blocker = result.error;
      this.notify();
      return;
    }
    this.activeAttempt = undefined;
    if (result.kind === "value") {
      const previous = this.commitNode.payload;
      this.outcome = { kind: "ready" };
      writeProducer(this.commitNode, {
        value: result.value,
        version: (previous?.version ?? 0) + 1,
        token: attempt.token,
      });
    } else {
      this.outcome = { kind: "failure", error: result.error };
    }
    this.notify();
  }
}

type Result<T> =
  | { readonly kind: "value"; readonly value: T }
  | { readonly kind: "error"; readonly error: unknown };

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
  const attempt = source.attempt();
  return source.commit() === undefined && attempt !== undefined;
}

export function isUpdating(source: AsyncSource<unknown>): boolean {
  const attempt = source.attempt();
  return source.commit() !== undefined && attempt !== undefined;
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
  options: AsyncOptions = {},
): Promise<T> {
  while (true) {
    if (options.signal?.aborted) throw options.signal.reason;
    try {
      return untracked(source.read);
    } catch (error) {
      if (!(error instanceof AsyncBlocker)) throw error;
      await waitForChange(error.promise, options.signal);
    }
  }
}

function waitForChange(
  promise: Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (signal === undefined) return promise;
  return new Promise<void>((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    });
  });
}
