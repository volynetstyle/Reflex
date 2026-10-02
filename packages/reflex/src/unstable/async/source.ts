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
} from "../../infra/factory";

import { Attempt, withAsyncExecution } from "./attempt";
import { throwAsyncFailure } from "./failure";
import { AsyncBlocker, AsyncDisposedError, AsyncProtocolError } from "./errors";
import {
  EMPTY_FRONTIER,
  FrontierBuilder,
  recordFreshnessDependency,
  withFrontierCollector,
  type FrontierSnapshot,
  type FreshnessDependency,
} from "./frontier";
import { waitForChange } from "./wait";
import type {
  AsyncAttempt,
  AsyncCommit,
  AsyncJob,
  AsyncOptions,
  AsyncSource,
} from "./types";

type Outcome =
  | { readonly kind: "ready" }
  | { readonly kind: "failure"; readonly error: unknown }
  | { readonly kind: "disposed" };

type Result<T> =
  | { readonly kind: "value"; readonly value: T }
  | { readonly kind: "error"; readonly error: unknown };

type Validation =
  | { readonly kind: "valid" }
  | { readonly kind: "superseded" }
  | { readonly kind: "blocked"; readonly blocker: AsyncBlocker }
  | { readonly kind: "error"; readonly error: unknown };

export class AsyncCore<T> implements AsyncSource<T>, FreshnessDependency {
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
  private frontier: FrontierSnapshot = EMPTY_FRONTIER;
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
        if (this.frontier.size !== 0) untracked(this.pullDependencies);
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
          for (const dependency of this.frontier) dependency.ensure();
        });
        runWatcher(this.watcher);
      } finally {
        this.validating = false;
      }
    });
  }

  private readonly pullDependencies = (): void => {
    for (const dependency of this.frontier) dependency.ensure();
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
    recordFreshnessDependency(this);
    this.ensure();
    readProducer(this.stateNode);
    if (this.outcome.kind === "disposed")
      throwAsyncFailure(new AsyncDisposedError());
    if (this.activeAttempt !== undefined) return undefined;
    if (this.outcome.kind === "failure") throwAsyncFailure(this.outcome.error);
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
      this.frontier = EMPTY_FRONTIER;
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
    const collector = new FrontierBuilder(this);
    let promise: Promise<T> | undefined;
    let candidate: Result<T>;
    try {
      untracked(() => previous?.controller.abort());
      this.notify();
      if (!attempt.alive()) return;
      candidate = withFrontierCollector(collector, () =>
        withAsyncExecution(attempt, (execution): Result<T> => {
          const result = this.job(execution);
          // Getters and Promise assimilation are part of synchronous capture too.
          if (
            result !== null &&
            (typeof result === "object" || typeof result === "function") &&
            typeof (result as PromiseLike<T>).then === "function"
          ) {
            promise = Promise.resolve(result);
          }
          return { kind: "value", value: result as T };
        }),
      );
    } catch (error) {
      candidate = { kind: "error", error };
    } finally {
      attempt.frontier = collector.snapshot();
      if (attempt.alive()) this.frontier = attempt.frontier;
    }
    if (promise !== undefined) {
      void promise.then(
        (value) => this.finish(attempt, { kind: "value", value }),
        (error: unknown) => this.finish(attempt, { kind: "error", error }),
      );
    } else {
      this.complete(attempt, candidate);
    }
  }

  private finish(attempt: Attempt, result: Result<T>): void {
    if (!attempt.alive()) return;
    this.within(() => this.complete(attempt, result, true));
  }

  /** No watcher reentry for synchronous results; async completion gets both checkpoints. */
  private validateAttempt(attempt: Attempt, recheck: boolean): Validation {
    if (!attempt.alive()) return { kind: "superseded" };
    try {
      return untracked(() => {
        if (recheck) this.ensure();
        for (const dependency of attempt.frontier) {
          if (!attempt.alive()) return { kind: "superseded" };
          dependency.validate();
          if (!attempt.alive()) return { kind: "superseded" };
        }
        if (recheck) this.ensure();
        return { kind: attempt.alive() ? "valid" : "superseded" };
      });
    } catch (error) {
      if (!attempt.alive()) return { kind: "superseded" };
      return error instanceof AsyncBlocker
        ? { kind: "blocked", blocker: error }
        : { kind: "error", error };
    }
  }

  private complete(attempt: Attempt, result: Result<T>, recheck = false): void {
    if (!attempt.alive()) return;
    const validation = this.validateAttempt(attempt, recheck);
    switch (validation.kind) {
      case "superseded":
        return;
      case "blocked":
        this.blockAttempt(attempt, validation.blocker);
        // Retain the candidate, but retry all proof obligations after the blocker wakes.
        void validation.blocker.promise.then(() =>
          this.finish(attempt, result),
        );
        return;
      case "error":
        this.publish(attempt, { kind: "error", error: validation.error });
        return;
      case "valid":
        if (!attempt.alive()) return;
        this.publish(attempt, result);
    }
  }

  private blockAttempt(attempt: Attempt, blocker: AsyncBlocker): void {
    if (!attempt.alive()) return;
    attempt.blocker = blocker;
    this.notify();
  }

  /** Publication probes already-pulled truth; they must not capture reactive edges. */
  validate(): void {
    if (this.outcome.kind === "disposed") throw new AsyncDisposedError();
    if (this.activeAttempt !== undefined) {
      const attempt = this.activeAttempt;
      if (!(attempt.readCache instanceof AsyncBlocker)) {
        attempt.readCache = new AsyncBlocker(this, this.whenReadChanges());
      }
      throw attempt.readCache;
    }
    if (this.outcome.kind === "failure") throw this.outcome.error;
  }

  private publish(attempt: Attempt, result: Result<T>): void {
    if (!attempt.alive()) return;
    if (result.kind === "error" && result.error instanceof AsyncBlocker) {
      this.blockAttempt(attempt, result.error);
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
