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

export type ResourceStatus = "idle" | "pending" | "resolved" | "rejected";

export interface ResourceGuard {
  readonly token: number;
  alive(): boolean;
}

export interface ResourceHandle<T, E = unknown> extends ResourceGuard {
  resolve(value: T): boolean;
  reject(error: E): boolean;
}

export interface Resource<T, E = unknown> {
  readonly status: Accessor<ResourceStatus>;
  readonly value: Accessor<T | undefined>;
  readonly error: Accessor<E | undefined>;
  readonly token: Accessor<number>;
  clear(): void;
  dispose(): void;
}

export interface ManualResource<T, E = unknown> extends Resource<T, E> {
  start(): ResourceHandle<T, E>;
}

export interface AsyncResource<T, E = unknown> extends Resource<T, E> {
  refetch(): void;
}

export type ResourceJob<T> = (guard: ResourceGuard) => T | PromiseLike<T>;
export type ResourceLoader<S, T> = (
  source: S,
  guard: ResourceGuard,
) => T | PromiseLike<T>;

export function isPending(resource: Resource<unknown, unknown>) {
  return "pending" === resource.status();
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
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
    readProducer(this.stateNode, this.context);
  }

  bump(): void {
    writeProducer(this.stateNode, this.stateNode.payload + 1);
  }

  isAlive(token: number): boolean {
    return !this.disposed && this.token === token;
  }

  start(): ResourceRequest<T, E> {
    const nextToken = this.disposed ? this.token : this.token + 1;

    if (!this.disposed) {
      this.token = nextToken;
      this.status = "pending";
      this.error = undefined;
      this.bump();
    }

    return new ResourceRequest(this, nextToken);
  }

  clear(): void {
    if (this.disposed) return;

    this.token += 1;
    this.status = "idle";
    this.value = undefined;
    this.error = undefined;
    this.bump();
  }

  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.token += 1;
    this.status = "idle";
    this.value = undefined;
    this.error = undefined;
    this.bump();

    if (this.watcher !== null) {
      disposeWatcher(this.watcher);
      this.watcher = null;
    }

    if (this.refetchNode !== null) {
      disposeNode(this.refetchNode);
      this.refetchNode = null;
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

    void result.then(
      (value) => {
        request.resolve(value);
      },
      (error) => {
        request.reject(error as E);
      },
    );
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
    if (this.disposed || this.refetchNode === null) return;

    writeProducer(this.refetchNode, this.refetchNode.payload + 1);
  }
}

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

  if (typeof sourceOrLoad === "function") {
    core.refetchNode = createResourceStateNode();

    if (typeof maybeLoad === "function") {
      const source = sourceOrLoad as Accessor<S>;
      const load = maybeLoad;

      core.watcher = createWatcherNode(() => {
        readProducer(core.refetchNode!, core.context);

        let sourceValue: S;

        try {
          sourceValue = source();
        } catch (error) {
          const request = core.start();
          request.reject(error as E);
          return;
        }

        core.runSourceLoad(sourceValue, load);
      });
    } else {
      const load = sourceOrLoad as ResourceJob<T>;

      core.watcher = createWatcherNode(() => {
        readProducer(core.refetchNode!, core.context);
        core.runLoad(load);
      });
    }

    runWatcher(core.watcher, core.context);
    core.context.registerWatcherCleanup(() => {
      core.dispose();
    });

    return {
      ...baseResource,
      refetch() {
        core.refetch();
      },
    };
  }

  core.context.registerWatcherCleanup(() => {
    core.dispose();
  });

  return {
    ...baseResource,
    start() {
      return core.start();
    },
  };
}
