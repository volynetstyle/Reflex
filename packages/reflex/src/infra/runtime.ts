import { createExecutionContext, setDefaultContext } from "@reflex/runtime";
import type { ExecutionContext, EngineHooks } from "@reflex/runtime";
import { subscribeEvent } from "./event";
import { createSource } from "./factory";
import { EventDispatcher } from "../policy";
import type { EffectStrategy } from "../policy/scheduler";
import {
  createEffectScheduler,
  resolveEffectSchedulerMode,
} from "../policy/scheduler";

export interface RuntimeOptions {
  /**
   * Optional low-level runtime hooks forwarded to the execution context.
   *
   * These hooks are composed with Reflex's scheduler integration rather than
   * replacing it.
   */
  hooks?: EngineHooks;
  /**
   * Controls when invalidated effects are executed.
   *
   * - `"flush"` queues reruns until `rt.flush()` is called.
   * - `"ranked"` queues reruns until `rt.flush()` and then drains higher-rank
   *   watchers before lower-rank ones.
   * - `"sab"` keeps lazy enqueue semantics but stabilizes effects after the
   *   outermost `rt.batch()` exits.
   * - `"eager"` flushes reruns automatically.
   *
   * @default "flush"
   */
  effectStrategy?: EffectStrategy;
}

function createRuntimeInfrastructure(options?: RuntimeOptions) {
  const executionContext = createExecutionContext(options?.hooks);
  const scheduler = createEffectScheduler(
    resolveEffectSchedulerMode(options?.effectStrategy),
    executionContext,
  );
  const dispatcher = new EventDispatcher(scheduler.batch);

  executionContext.setRuntimeHooks(
    scheduler.enqueue,
    scheduler.runtimeNotifySettled,
  );

  executionContext.resetState();
  setDefaultContext(executionContext);

  return {
    scheduler,
    dispatcher,
    executionContext,
  };
}

/**
 * Push-based event stream that allows observers to subscribe to future values.
 *
 * `Event` is the read-only view of an event source. It does not expose
 * mutation, only observation.
 *
 * @typeParam T - Event payload type.
 */
export interface Event<T> {
  /**
   * Registers a callback for future event deliveries.
   *
   * @param fn - Callback invoked for each emitted value.
   *
   * @returns Destructor that unsubscribes `fn`.
   */
  subscribe(fn: (value: T) => void): Destructor;
}

/**
 * Mutable event source created by `Runtime.event()`.
 *
 * @typeParam T - Event payload type.
 */
export interface EventSource<T> extends Event<T> {
  /**
   * Emits a value to current subscribers using the runtime dispatcher.
   *
   * Nested emits are queued after the current delivery completes, preserving
   * FIFO ordering across sources created by the same runtime.
   *
   * @param value - Event payload to deliver.
   */
  emit(value: T): void;
}

/**
 * Connected Reflex runtime returned by `createRuntime()`.
 *
 * The runtime owns the event dispatcher, effect scheduler, and execution
 * context used by the top-level Reflex primitives.
 */
export interface Runtime {
  batch<T>(fn: () => T): T;
  /**
   * Creates a new mutable event source associated with this runtime.
   *
   * @typeParam T - Event payload type.
   *
   * @returns Event source with `emit(value)` and `subscribe(fn)`.
   */
  event<T>(): EventSource<T>;
  /**
   * Flushes queued effect re-runs immediately.
   *
   * In the default `"flush"` strategy, call this after writes when you want
   * scheduled effects to observe the latest stable snapshot. In `"sab"` and
   * `"eager"` it remains available as an explicit synchronization escape hatch.
   */
  flush(): void;
  /**
   * Underlying execution context used by this runtime.
   *
   * Most application code does not need this. It exists for low-level
   * integrations, tests, and diagnostics.
   */
  readonly ctx: ExecutionContext;
}

/**
 * Creates and installs the active Reflex runtime.
 *
 * `createRuntime` wires together an execution context, effect scheduler, and
 * event dispatcher, then makes that context the default runtime used by the
 * top-level Reflex primitives exported from this package.
 *
 * @param options - Optional runtime configuration:
 * - `effectStrategy` controls whether invalidated effects flush on
 *   `rt.flush()`, flush in rank order, stabilize after the outermost batch, or
 *   run automatically.
 * - `hooks` installs low-level runtime hooks that are composed with Reflex's
 *   scheduler integration.
 *
 * @returns Connected runtime with event creation, flushing, and context
 * access.
 *
 * @example
 * ```ts
 * const rt = createRuntime();
 * const ticks = rt.event<number>();
 * const [count, setCount] = signal(0);
 *
 * ticks.subscribe((value) => {
 *   setCount((current) => current + value);
 * });
 *
 * effect(() => {
 *   console.log(count());
 * });
 *
 * ticks.emit(1);
 * rt.flush();
 * ```
 *
 * @remarks
 * - Call this once during app startup or per test case to establish the active
 *   runtime.
 * - Creating a new runtime replaces the previously active default context.
 * - `rt.flush()` is primarily for scheduled effects; signals and computed
 *   reads stay current without it.
 * - Event sources created by `rt.event()` share one dispatcher and preserve
 *   FIFO delivery order.
 */
export function createRuntime(options?: RuntimeOptions): Runtime {
  const { scheduler, dispatcher, executionContext } =
    createRuntimeInfrastructure(options);
  return {
    ctx: executionContext,
    batch: scheduler.batch,

    event<T>() {
      const source = createSource();

      return {
        subscribe(fn: (value: T) => void) {
          return subscribeEvent(source, fn);
        },
        emit(value: T) {
          dispatcher.emit(source, value);
        },
      };
    },
    flush: scheduler.flush,
  };
}
