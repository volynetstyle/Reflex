import type { ReactiveNode } from "@reflex/runtime";
import {
  disposeNode,
  disposeWatcher,
  getDefaultContext,
  readProducer,
  runWatcher,
  writeProducer,
} from "@reflex/runtime";
import { createResourceStateNode, createWatcherNode } from "../infra";

/**
 * Current lifecycle state of a resource request.
 *
 * - `"idle"` - no active request is in flight.
 * - `"pending"` - the current request is still running.
 * - `"resolved"` - the latest current request completed successfully.
 * - `"rejected"` - the latest current request failed.
 */
export type ResourceStatus = "idle" | "pending" | "resolved" | "rejected";

/**
 * Guard object bound to a single resource request token.
 *
 * Loaders receive a guard so they can tell whether their work is still current
 * before committing side effects or returning follow-up work.
 */
export interface ResourceGuard {
  /**
   * Monotonic token identifying the request that produced this guard.
   */
  readonly token: number;
  /**
   * Returns `true` while this request is still current and the resource has not
   * been disposed.
   */
  alive(): boolean;
}

/**
 * Mutable handle for manually settling a resource request.
 *
 * Manual resources expose this handle from `start()`. It extends
 * `ResourceGuard` with methods that attempt to resolve or reject the current
 * request.
 *
 * @typeParam T - Resolved value type.
 * @typeParam E - Rejection type.
 */
export interface ResourceHandle<T, E = unknown> extends ResourceGuard {
  /**
   * Resolves the request with `value`.
   *
   * @param value - Value to commit as the latest successful result.
   *
   * @returns `true` if the value was accepted, or `false` if this handle is
   * stale or the resource has already been disposed.
   */
  resolve(value: T): boolean;
  /**
   * Rejects the request with `error`.
   *
   * @param error - Error to commit as the latest failure.
   *
   * @returns `true` if the error was accepted, or `false` if this handle is
   * stale or the resource has already been disposed.
   */
  reject(error: E): boolean;
}

/**
 * Reactive view of a resource request lifecycle.
 *
 * A resource exposes tracked accessors for its status, latest value, latest
 * error, and current request token, along with imperative controls to reset or
 * dispose the resource.
 *
 * @typeParam T - Resolved value type.
 * @typeParam E - Rejection type.
 */
export interface Resource<T, E = unknown> {
  /**
   * Tracked accessor that returns the current request lifecycle state.
   */
  readonly status: Accessor<ResourceStatus>;
  /**
   * Tracked accessor that returns the latest successfully resolved value, if
   * one exists.
   *
   * The last resolved value is retained while a newer request is pending or
   * rejected.
   */
  readonly value: Accessor<T | undefined>;
  /**
   * Tracked accessor that returns the latest rejected error, if one exists.
   */
  readonly error: Accessor<E | undefined>;
  /**
   * Tracked accessor that returns the current monotonic request token.
   *
   * The token increments whenever a new request starts, the resource is
   * cleared, or the resource is disposed.
   */
  readonly token: Accessor<number>;
  /**
   * Resets the resource to the `"idle"` state and invalidates any in-flight
   * request.
   */
  clear(): void;
  /**
   * Disposes the resource permanently and invalidates any in-flight request.
   *
   * After disposal, the resource stops reacting to future source changes or
   * refetch requests.
   */
  dispose(): void;
}

/**
 * Imperative resource whose requests are started and settled manually.
 *
 * @typeParam T - Resolved value type.
 * @typeParam E - Rejection type.
 */
export interface ManualResource<T, E = unknown> extends Resource<T, E> {
  /**
   * Starts a new request and returns a handle that can resolve or reject it.
   *
   * Starting a new request invalidates all older handles.
   */
  start(): ResourceHandle<T, E>;
}

/**
 * Auto-loading resource backed by a loader function.
 *
 * @typeParam T - Resolved value type.
 * @typeParam E - Rejection type.
 */
export interface AsyncResource<T, E = unknown> extends Resource<T, E> {
  /**
   * Requests another load.
   *
   * In the default runtime strategy, the reload starts when the surrounding
   * runtime flushes scheduled effects.
   */
  refetch(): void;
}

/**
 * Loader used by `resource(load)`.
 *
 * It receives a guard for the current request and may return either a value or
 * a promise-like value.
 *
 * @typeParam T - Resolved value type.
 */
export type ResourceJob<T> = (guard: ResourceGuard) => T | PromiseLike<T>;

/**
 * Loader used by `resource(source, load)`.
 *
 * It receives the latest source value plus a guard for the current request, and
 * may return either a value or a promise-like value.
 *
 * @typeParam S - Source value type.
 * @typeParam T - Resolved value type.
 */
export type ResourceLoader<S, T> = (
  source: S,
  guard: ResourceGuard,
) => T | PromiseLike<T>;

/**
 * Returns `true` when the resource's current request is pending.
 *
 * @param resource - Resource to inspect.
 *
 * @returns Whether `resource.status()` currently equals `"pending"`.
 */
export function isPending(resource: Resource<unknown, unknown>): boolean {
  return "pending" === resource.status();
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  const kind = typeof value;
  return (
    (kind === "object" || kind === "function") &&
    value !== null &&
    typeof (value as PromiseLike<T>).then === "function"
  );
}

class ResourceRequest<T, E = unknown> implements ResourceHandle<T, E> {
  constructor(
    private readonly owner: ResourceCore<T, E>,
    readonly token: number,
  ) {}

  alive(): boolean {
    return this.owner.isAlive(this.token);
  }

  resolve(value: T): boolean {
    return this.owner.resolve(this.token, value);
  }

  reject(error: E): boolean {
    return this.owner.reject(this.token, error);
  }

  readonly onResolve = (value: T): void => {
    this.owner.resolve(this.token, value);
  };

  readonly onReject = (error: unknown): void => {
    this.owner.reject(this.token, error as E);
  };
}

class ResourceCore<T, E = unknown> {
  readonly context = getDefaultContext();
  readonly stateNode = createResourceStateNode();

  status: ResourceStatus = "idle";
  value: T | undefined = undefined;
  error: E | undefined = undefined;
  token = 0;
  disposed = false;
  watcher: ReactiveNode | null = null;
  refetchNode: ReactiveNode<number> | null = null;

  track(): void {
    readProducer(this.stateNode);
  }

  bump(): void {
    writeProducer(this.stateNode, this.stateNode.payload + 1);
  }

  isAlive(token: number): boolean {
    return !this.disposed && this.token === token;
  }

  begin(): number {
    if (this.disposed) return this.token;

    const nextToken = this.token + 1;
    this.token = nextToken;
    this.status = "pending";
    this.error = undefined;
    this.bump();
    return nextToken;
  }

  start(): ResourceRequest<T, E> {
    return new ResourceRequest(this, this.begin());
  }

  private resetToIdle(nextToken: number): void {
    this.token = nextToken;
    this.status = "idle";
    this.value = undefined;
    this.error = undefined;
    this.bump();
  }

  clear(): void {
    if (this.disposed) return;
    this.resetToIdle(this.token + 1);
  }

  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.resetToIdle(this.token + 1);

    const watcher = this.watcher;
    if (watcher !== null) {
      this.watcher = null;
      disposeWatcher(watcher);
    }

    const refetchNode = this.refetchNode;
    if (refetchNode !== null) {
      this.refetchNode = null;
      disposeNode(refetchNode);
    }
  }

  resolve(token: number, value: T): boolean {
    if (!this.isAlive(token)) return false;
    this.status = "resolved";
    this.value = value;
    this.error = undefined;
    this.bump();
    return true;
  }

  reject(token: number, error: E): boolean {
    if (!this.isAlive(token)) return false;
    this.status = "rejected";
    this.error = error;
    this.bump();
    return true;
  }

  settle(result: T | PromiseLike<T>, request: ResourceRequest<T, E>): void {
    if (!isPromiseLike(result)) {
      request.resolve(result);
      return;
    }

    void result.then(request.onResolve, request.onReject);
  }

  runLoad(load: ResourceJob<T>): void {
    const request = this.start();
    let result: T | PromiseLike<T>;

    try {
      result = load(request);
    } catch (error) {
      request.reject(error as E);
      return;
    }

    this.settle(result, request);
  }

  runSourceLoad<S>(sourceValue: S, load: ResourceLoader<S, T>): void {
    const request = this.start();
    let result: T | PromiseLike<T>;

    try {
      result = load(sourceValue, request);
    } catch (error) {
      request.reject(error as E);
      return;
    }

    this.settle(result, request);
  }

  refetch(): void {
    const refetchNode = this.refetchNode;
    if (this.disposed || refetchNode === null) return;

    writeProducer(refetchNode, refetchNode.payload + 1);
  }
}

/**
 * Creates an unstable resource for manual or loader-driven async state.
 *
 * `resource` models request lifecycles with tracked accessors for `status`,
 * `value`, `error`, and `token`. It can be used in three modes:
 *
 * - `resource<T, E>()` creates a manual resource. Call `start()` to begin a
 *   request, then settle that request through the returned handle.
 * - `resource(load)` creates an auto-loading resource that starts immediately
 *   and can be reloaded with `refetch()`.
 * - `resource(source, load)` creates a source-driven resource that reloads
 *   whenever `source()` changes.
 *
 * @typeParam S - Source value type for the source-driven overload.
 * @typeParam T - Resolved value type.
 * @typeParam E - Rejection type tracked by `error()`.
 *
 * @param sourceOrLoad - Either the reactive source accessor to watch or the
 *   no-source loader function, depending on the overload.
 * @param maybeLoad - Loader used with the source-driven overload.
 *
 * @returns Either a `ManualResource` or an `AsyncResource`, depending on the
 * selected overload.
 *
 * @example
 * ```ts
 * import { createRuntime, signal } from "@volynets/reflex";
 * import { resource } from "@volynets/reflex/unstable";
 *
 * const rt = createRuntime();
 * const [userId, setUserId] = signal(1);
 *
 * const user = resource(() => userId(), async (id) => {
 *   await Promise.resolve();
 *   return { id, name: `user-${id}` };
 * });
 *
 * console.log(user.status()); // "pending"
 *
 * setUserId(2);
 * rt.flush();
 * ```
 *
 * @remarks
 * - This API is exported from `@volynets/reflex/unstable` and may change
 *   between releases.
 * - Each new request increments `token()`. Older handles and stale async
 *   resolutions are ignored automatically.
 * - `value()` retains the last resolved value while a newer request is pending
 *   or rejected.
 * - `clear()` resets the resource to `"idle"` and invalidates the current
 *   request.
 * - `dispose()` invalidates the current request and permanently stops future
 *   updates.
 * - `refetch()` and source changes schedule a new load through the runtime.
 *   With the default effect strategy, call `rt.flush()` to start it.
 * - If a source accessor or loader throws synchronously, the current request
 *   is rejected with that error.
 *
 * @see isPending
 * @see createRuntime
 */
export function resource<T, E = unknown>(): ManualResource<T, E>;
export function resource<T, E = unknown>(
  load: ResourceJob<T>,
): AsyncResource<T, E>;
export function resource<S, T, E = unknown>(
  source: Accessor<S>,
  load: ResourceLoader<S, T>,
): AsyncResource<T, E>;
export function resource<S, T, E = unknown>(
  sourceOrLoad?: Accessor<S> | ResourceJob<T>,
  maybeLoad?: ResourceLoader<S, T>,
): ManualResource<T, E> | AsyncResource<T, E> {
  const core = new ResourceCore<T, E>();

  core.context.registerWatcherCleanup(() => {
    core.dispose();
  });

  const baseResource: Resource<T, E> = {
    status: () => {
      core.track();
      return core.status;
    },
    value: () => {
      core.track();
      return core.value;
    },
    error: () => {
      core.track();
      return core.error;
    },
    token: () => {
      core.track();
      return core.token;
    },
    clear() {
      core.clear();
    },
    dispose() {
      core.dispose();
    },
  };

  if (typeof sourceOrLoad !== "function") {
    return {
      ...baseResource,
      start() {
        return core.start();
      },
    };
  }

  core.refetchNode = createResourceStateNode();

  if (typeof maybeLoad === "function") {
    const source = sourceOrLoad as Accessor<S>;
    const load = maybeLoad;

    core.watcher = createWatcherNode(() => {
      const refetchNode = core.refetchNode;
      if (refetchNode !== null) readProducer(refetchNode);

      let sourceValue: S;
      try {
        sourceValue = source();
      } catch (error) {
        const token = core.begin();
        core.reject(token, error as E);
        return;
      }

      core.runSourceLoad(sourceValue, load);
    });
  } else {
    const load = sourceOrLoad as ResourceJob<T>;

    core.watcher = createWatcherNode(() => {
      const refetchNode = core.refetchNode;
      if (refetchNode !== null) readProducer(refetchNode);
      core.runLoad(load);
    });
  }

  runWatcher(core.watcher);

  return {
    ...baseResource,
    refetch() {
      core.refetch();
    },
  };
}
