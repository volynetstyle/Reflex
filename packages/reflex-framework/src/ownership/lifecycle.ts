/// <reference lib="esnext.disposable" />

import { addCleanup, disposeOwnershipNode } from "./ownership.cleanup";
import { isShuttingDown } from "./ownership.meta";
import { OwnershipNode } from "./ownership.node";
import { adoptOwnershipNode } from "./ownership.tree";

export interface DisposableResource {
  [Symbol.dispose](): void;
}

type AnyFunction = (...args: never[]) => unknown;

export type Synchronous<F extends AnyFunction> = F &
  ([Extract<ReturnType<F>, PromiseLike<unknown>>] extends [never]
    ? unknown
    : { readonly __error__: "A synchronous callback is required." });

export type CleanupRunner = <T>(fn: () => T) => T;
const direct: CleanupRunner = (fn) => fn();

/** Development check for callbacks used by synchronous ownership cleanup. */
export function assertSynchronous<T>(value: T): T {
  if (
    __DEV__ &&
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof Reflect.get(value, "then") === "function"
  ) {
    throw new TypeError(
      "A synchronous callback returned a Promise-like value.",
    );
  }
  return value;
}

/** One explicit identity for a disposable resource in the ownership tree. */
export class LifecycleHandle<
  T extends DisposableResource,
> implements DisposableResource {
  readonly #node = new OwnershipNode();
  readonly value: T;

  constructor(value: T, runCleanup: CleanupRunner = direct) {
    const method = value[Symbol.dispose];
    if (__DEV__ && typeof method !== "function") {
      throw new TypeError("Missing Symbol.dispose.");
    }

    this.value = value;
    addCleanup(this.#node, () => {
      runCleanup(() => assertSynchronous(Reflect.apply(method, value, [])));
    });
  }

  get node(): OwnershipNode {
    return this.#node;
  }

  get disposed(): boolean {
    return isShuttingDown(this.#node);
  }

  dispose(): void {
    disposeOwnershipNode(this.#node);
  }

  [Symbol.dispose](): void {
    this.dispose();
  }
}

/** An external value representing an existing scope, without another node. */
export class LifecycleBinding<
  T extends DisposableResource,
> implements DisposableResource {
  readonly value: T;
  readonly #scope: LifecycleScope;

  constructor(value: T, scope: LifecycleScope) {
    this.value = value;
    this.#scope = scope;
  }

  get node(): OwnershipNode {
    return this.#scope.node;
  }

  get disposed(): boolean {
    return this.#scope.disposed;
  }

  dispose(): void {
    this.#scope.dispose();
  }

  [Symbol.dispose](): void {
    this.dispose();
  }
}

/** Return the explicit handle that must be passed to a parent scope. */
export function registerLifecycle<T extends DisposableResource>(
  resource: T,
  scope: LifecycleScope,
): LifecycleBinding<T> {
  return new LifecycleBinding(resource, scope);
}

type LifecycleChild =
  | LifecycleScope
  | LifecycleHandle<DisposableResource>
  | LifecycleBinding<DisposableResource>;

/** Policy over OwnershipNode; the node is the sole ownership record. */
export class LifecycleScope implements DisposableResource {
  readonly #node = new OwnershipNode();
  readonly #runCleanup: CleanupRunner;

  constructor(runCleanup: CleanupRunner = direct) {
    this.#runCleanup = runCleanup;
  }

  get node(): OwnershipNode {
    return this.#node;
  }

  get disposed(): boolean {
    return isShuttingDown(this.#node);
  }

  assertOpen(): void {
    if (__DEV__ && this.disposed) {
      throw new Error("The lifecycle scope is closed.");
    }
  }

  defer<F extends () => unknown>(cleanup: Synchronous<F>): void {
    this.assertOpen();
    if (this.disposed) return;
    if (__DEV__ && typeof cleanup !== "function") {
      throw new TypeError("Expected cleanup.");
    }
    addCleanup(this.#node, () => {
      this.#runCleanup(() => assertSynchronous(cleanup()));
    });
  }

  /** Create an explicit handle; adopt it with own() or dispose it directly. */
  handle<T extends DisposableResource>(resource: T): LifecycleHandle<T> {
    return new LifecycleHandle(resource, this.#runCleanup);
  }

  /** Exclusive ownership of a handle or nested scope, with idempotent adoption. */
  own<T extends LifecycleChild>(child: T): T {
    adoptOwnershipNode(this.#node, child.node);
    return child;
  }

  dispose(): void {
    disposeOwnershipNode(this.#node);
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  /** Cleanup errors follow OwnershipNode policy; retain the original cause. */
  rollback(cause: unknown): never {
    this.dispose();
    throw cause;
  }
}
