import { enterReactiveBatch, leaveReactiveBatch } from "../kernel/batch";
import type {
  ReadTrackingStrategy,
  RuntimeHooks,
  RuntimeSchedulerHooks,
} from "../kernel/config";
import {
  configureRuntimeContext,
  createRuntimeContext,
  getActiveRuntimeContext,
  runWithRuntimeContext,
  type RuntimeContext,
} from "../kernel/context";
import type { ReactiveNode } from "../kernel/shape";

/**
 * Host scheduler policy attached to exactly one execution domain.
 *
 * Hooks follow the runtime contract: `onNodeInvalidated` only enqueues.
 * `batch`/`flush`, when present, replace the default composition and always
 * run inside the domain.
 */
export interface ExecutionDomainScheduler {
  readonly onNodeInvalidated?: (node: ReactiveNode) => void;
  readonly onRuntimeIdle?: () => void;
  readonly onHostFlush?: () => void;
  enterBatch?(): void;
  leaveBatch?(): void;
  batch?<T>(fn: () => T): T;
  flush?(): void;
  hasPending?(): boolean;
  /** Drops queued work and pending host requests when the domain closes. */
  release?(): void;
}

export interface ExecutionDomainOptions {
  /** Additional host hooks, composed after the scheduler's own hooks. */
  hooks?: RuntimeHooks;
  readTrackingStrategy?: ReadTrackingStrategy;
  /** A scheduler, or a factory receiving the domain's runtime context. */
  scheduler?:
    | ExecutionDomainScheduler
    | ((context: RuntimeContext) => ExecutionDomainScheduler);
  /** Receives errors thrown by deferred teardown. Defaults to console.error. */
  onTeardownError?: (error: unknown) => void;
}

export const ExecutionDomainState = {
  Open: 0,
  Closing: 1,
  Closed: 2,
} as const;

export type ExecutionDomainState =
  (typeof ExecutionDomainState)[keyof typeof ExecutionDomainState];

/**
 * An isolated reactive execution area: one register bank, one scheduler, one
 * managed entry depth. Nodes are not tagged with their domain; isolation is a
 * contract of the managed entry points (see docs/architecture).
 */
export interface ExecutionDomain {
  readonly context: RuntimeContext;
  readonly state: ExecutionDomainState;
  /** `true` once `close()` was requested. */
  readonly closed: boolean;
  /** Aborted as soon as `close()` is requested. */
  readonly signal: AbortSignal;
  /** Managed entries currently on the stack. Zero is a safe point. */
  readonly depth: number;
  run<T>(fn: () => T): T;
  batch<T>(fn: () => T): T;
  flush(): void;
  hasPending(): boolean;
  /**
   * Runs graph teardown at a safe point: now when no managed entry of this
   * domain is on the stack, otherwise at the outermost managed exit.
   */
  teardown(fn: () => void): void;
  /** Logical close now; physical teardown at the next safe point. */
  close(): void;
}

export class ExecutionDomainClosedError extends Error {
  constructor() {
    super("The execution domain is closed.");
    this.name = "ExecutionDomainClosedError";
  }
}

const domains = new WeakMap<RuntimeContext, ExecutionDomain>();

/** The domain that owns `context`, if it was created by a domain. */
export function getExecutionDomain(
  context: RuntimeContext,
): ExecutionDomain | undefined {
  return domains.get(context);
}

/** The domain of the active runtime context, if any. */
export function getActiveExecutionDomain(): ExecutionDomain | undefined {
  return domains.get(getActiveRuntimeContext());
}

function reportTeardownError(error: unknown): void {
  console.error("Execution domain teardown error:", error);
}

/** Hooks are untrusted input: anything but a function is ignored. */
function compose<A extends unknown[]>(
  first: unknown,
  second: unknown,
): ((...args: A) => void) | undefined {
  if (typeof first !== "function") first = undefined;
  if (typeof second !== "function") second = undefined;
  if (first === undefined) return second as ((...args: A) => void) | undefined;
  if (second === undefined) return first as (...args: A) => void;
  return (...args: A): void => {
    (first as (...args: A) => void)(...args);
    (second as (...args: A) => void)(...args);
  };
}

function throwCollected(errors: unknown[] | undefined): void {
  if (errors === undefined) return;
  if (errors.length === 1) throw errors[0];
  throw new AggregateError(errors, "Reactive batch failed");
}

export function createExecutionDomain(
  options: ExecutionDomainOptions = {},
): ExecutionDomain {
  const context = createRuntimeContext(
    options.readTrackingStrategy === undefined
      ? {}
      : { readTrackingStrategy: options.readTrackingStrategy },
  );
  const scheduler: ExecutionDomainScheduler =
    typeof options.scheduler === "function"
      ? options.scheduler(context)
      : (options.scheduler ?? {});
  const onTeardownError = options.onTeardownError ?? reportTeardownError;
  const hooks = options.hooks;

  // Trusted, already-validated hooks; the context is still inactive.
  context.nodeInvalidatedHook = compose(
    scheduler.onNodeInvalidated,
    hooks?.onNodeInvalidated,
  );
  context.runtimeIdleHook = compose(
    scheduler.onRuntimeIdle,
    hooks?.onRuntimeIdle,
  );
  context.hostFlushHook = compose(scheduler.onHostFlush, undefined);

  let state: ExecutionDomainState = ExecutionDomainState.Open;
  let depth = 0;
  let controller: AbortController | undefined;
  const pendingTeardown: Array<() => void> = [];
  let draining = false;

  const enter = <T>(fn: () => T): T =>
    getActiveRuntimeContext() === context
      ? fn()
      : runWithRuntimeContext(context, fn);

  const drain = (): void => {
    if (draining) return;
    draining = true;
    try {
      enter(() => {
        while (pendingTeardown.length !== 0) {
          const task = pendingTeardown.shift()!;
          try {
            task();
          } catch (error) {
            onTeardownError(error);
          }
        }
      });
    } finally {
      draining = false;
    }
  };

  const finalize = (): void => {
    drain();
    state = ExecutionDomainState.Closed;
    // Stray raw writes after close must not reach the released scheduler.
    configureRuntimeContext(context, {
      hooks: {},
      scheduler: {} satisfies RuntimeSchedulerHooks,
    });
  };

  const run = <T>(fn: () => T): T => {
    if (state === ExecutionDomainState.Closed) {
      throw new ExecutionDomainClosedError();
    }

    ++depth;
    try {
      return enter(fn);
    } finally {
      if (--depth === 0) {
        if (pendingTeardown.length !== 0) drain();
        if (state === ExecutionDomainState.Closing) finalize();
      }
    }
  };

  const defaultBatch = <T>(fn: () => T): T => {
    // Close scheduler policy before the reactive batch so a settled hook never
    // observes the scheduler in its batching phase.
    enterReactiveBatch();
    scheduler.enterBatch?.();

    let errors: unknown[] | undefined;
    try {
      return fn();
    } catch (error) {
      errors = [error];
      throw error;
    } finally {
      try {
        scheduler.leaveBatch?.();
      } catch (error) {
        (errors ??= []).push(error);
      }
      try {
        leaveReactiveBatch();
      } catch (error) {
        (errors ??= []).push(error);
      }
      throwCollected(errors);
    }
  };

  const batchImpl = scheduler.batch ?? defaultBatch;
  const flushImpl = scheduler.flush;

  const domain: ExecutionDomain = {
    context,
    get state() {
      return state;
    },
    get closed() {
      return state !== ExecutionDomainState.Open;
    },
    get signal() {
      if (controller === undefined) {
        controller = new AbortController();
        if (state !== ExecutionDomainState.Open) controller.abort();
      }
      return controller.signal;
    },
    get depth() {
      return depth;
    },
    run,
    batch<T>(fn: () => T): T {
      return run(() => batchImpl(fn));
    },
    flush(): void {
      if (state === ExecutionDomainState.Closed || flushImpl === undefined) {
        return;
      }
      run(flushImpl);
    },
    hasPending(): boolean {
      return state !== ExecutionDomainState.Closed
        ? (scheduler.hasPending?.() ?? false)
        : false;
    },
    teardown(fn: () => void): void {
      if (depth === 0 && !draining) {
        enter(fn);
        return;
      }
      pendingTeardown.push(fn);
    },
    close(): void {
      if (state !== ExecutionDomainState.Open) return;
      state = ExecutionDomainState.Closing;
      try {
        scheduler.release?.();
      } finally {
        controller?.abort();
        if (depth === 0) finalize();
      }
    },
  };

  domains.set(context, domain);
  return domain;
}
