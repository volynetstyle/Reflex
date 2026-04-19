import {
  registerWatcherCleanup,
  readConsumerEager,
  readConsumerLazy,
  readProducer,
  untracked,
  writeProducer,
} from "@reflex/runtime";
import { batch, createComputedNode, createResourceStateNode } from "../infra";

export interface OptimisticOptions<T> {
  equals?: (prev: T, next: T) => boolean;
  name?: string;
}

export interface OptimisticMemoOptions<T> extends OptimisticOptions<T> {
  id?: string;
  lazy?: boolean;
}

class OptimisticTransition {
  private readonly cleanups = new Set<() => void>();
  private finalized = false;

  add(cleanup: () => void): void {
    if (this.finalized) {
      cleanup();
      return;
    }

    this.cleanups.add(cleanup);
  }

  finalize(): void {
    if (this.finalized) return;
    this.finalized = true;

    const cleanups = [...this.cleanups];
    this.cleanups.clear();

    for (let i = 0; i < cleanups.length; ++i) {
      cleanups[i]?.();
    }
  }
}

interface OptimisticOverride<T> {
  owner: object;
  value: T;
}

let activeTransition: OptimisticTransition | null = null;

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<T>).then === "function"
  );
}

function isOptimisticOptionsLike<T>(
  value: unknown,
): value is OptimisticMemoOptions<T> {
  return (
    value !== null &&
    typeof value === "object" &&
    ("equals" in value || "name" in value || "id" in value || "lazy" in value)
  );
}

function sameValue<T>(prev: T, next: T): boolean {
  return Object.is(prev, next);
}

class OptimisticCore<T> {
  private readonly stateNode = createResourceStateNode();
  private readonly registeredTransitions = new WeakSet<OptimisticTransition>();
  private activeOverride: OptimisticOverride<T> | null = null;

  private disposed = false;

  constructor(
    private readonly base: Accessor<T>,
    private readonly equals: (prev: T, next: T) => boolean,
  ) {
    registerWatcherCleanup(() => {
      this.dispose();
    });
  }

  read = (): T => {
    readProducer(this.stateNode);

    const override = this.activeOverride;
    return override ? override.value : this.base();
  };

  set = (input: SetInput<T>): T => {
    const prev = this.peekVisible();
    const next =
      typeof input === "function"
        ? (input as (prev: T) => T)(prev)
        : input;

    if (this.disposed) {
      return next;
    }

    const owner = activeTransition ?? this.createMicrotaskOwner();
    const override = this.activeOverride;

    if (override?.owner === owner) {
      if (this.equals(override.value, next)) {
        return next;
      }

      override.value = next;

      if (!this.equals(prev, next)) {
        this.bump();
      }

      return next;
    }

    this.activeOverride = { owner, value: next };

    if (owner instanceof OptimisticTransition) {
      this.registerTransition(owner);
    }

    if (!this.equals(prev, next)) {
      this.bump();
    }

    return next;
  };

  private peekVisible(): T {
    const override = this.activeOverride;
    return override ? override.value : this.peekBase();
  }

  private peekBase(): T {
    return untracked(this.base);
  }

  private createMicrotaskOwner(): object {
    const owner = {};

    queueMicrotask(() => {
      this.clearOwner(owner);
    });

    return owner;
  }

  private registerTransition(owner: OptimisticTransition): void {
    if (this.registeredTransitions.has(owner)) return;
    this.registeredTransitions.add(owner);

    owner.add(() => {
      this.registeredTransitions.delete(owner);
      this.clearOwner(owner);
    });
  }

  private clearOwner(owner: object): void {
    if (this.disposed) return;

    const override = this.activeOverride;
    if (!override || override.owner !== owner) return;

    const previous = override.value;
    this.activeOverride = null;

    const next = this.peekBase();
    if (!this.equals(previous, next)) {
      this.bump();
    }
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    const override = this.activeOverride;
    if (!override) return;

    this.activeOverride = null;

    if (!this.equals(override.value, this.peekBase())) {
      this.bump();
    }
  }

  private bump(): void {
    writeProducer(this.stateNode, this.stateNode.payload + 1);
  }
}

/**
 * Runs `fn` inside an unstable optimistic transition boundary.
 *
 * Optimistic values written with `optimistic()` remain visible until the
 * transition settles. Synchronous transitions settle when `fn` returns. Async
 * transitions settle when the returned promise resolves or rejects.
 *
 * @example
 * ```ts
 * import { createRuntime } from "@volynets/reflex";
 * import { optimistic, transition } from "@volynets/reflex/unstable";
 *
 * createRuntime();
 *
 * const [status, setStatus] = optimistic("idle");
 *
 * await transition(async () => {
 *   setStatus("saving");
 *   await Promise.resolve();
 * });
 *
 * console.log(status()); // "idle"
 * ```
 */
export function transition<T>(fn: () => T): T;
export function transition<T>(fn: () => PromiseLike<T>): Promise<T>;
export function transition<T>(fn: () => T | PromiseLike<T>): T | Promise<T> {
  const parent = activeTransition;
  const owner = new OptimisticTransition();
  activeTransition = owner;

  let result: T | PromiseLike<T>;

  try {
    result = batch(fn);
  } catch (error) {
    activeTransition = parent;
    owner.finalize();
    throw error;
  }

  activeTransition = parent;

  if (!isPromiseLike(result)) {
    owner.finalize();
    return result;
  }

  return Promise.resolve(result).then(
    (value) => {
      owner.finalize();
      return value;
    },
    (error) => {
      owner.finalize();
      throw error;
    },
  );
}

/**
 * Creates an unstable optimistic signal.
 *
 * Plain values use a fixed fallback value. Function overloads derive their
 * fallback from a tracked memo-like computation and temporarily apply a single
 * optimistic override on top.
 *
 * @param valueOrFn - Either a fixed fallback value or a tracked computation
 * that provides the fallback value when no optimistic layer is active.
 * @param initialValueOrOptions - Optional initial value for the function
 * overload, or options for either overload.
 * @param maybeOptions - Additional options for the function overload.
 *
 * @returns A tuple containing the tracked accessor and optimistic setter.
 *
 * @example
 * ```ts
 * import { createRuntime } from "@volynets/reflex";
 * import { optimistic } from "@volynets/reflex/unstable";
 *
 * createRuntime();
 *
 * const [label, setLabel] = optimistic("draft");
 *
 * setLabel("saving");
 * console.log(label()); // "saving"
 *
 * await Promise.resolve();
 * console.log(label()); // "draft"
 * ```
 *
 * @example
 * ```ts
 * import { createRuntime, signal } from "@volynets/reflex";
 * import { optimistic, transition } from "@volynets/reflex/unstable";
 *
 * createRuntime();
 *
 * const [serverCount, setServerCount] = signal(1);
 * const [count, setCount] = optimistic(() => serverCount());
 *
 * await transition(async () => {
 *   setCount(99);
 *   setServerCount(2);
 *
 *   console.log(count()); // 99
 *   await Promise.resolve();
 * });
 *
 * console.log(count()); // 2
 * ```
 *
 * @example
 * ```ts
 * import { createRuntime } from "@volynets/reflex";
 * import { optimistic } from "@volynets/reflex/unstable";
 *
 * createRuntime();
 *
 * const [value, setValue] = optimistic(10);
 *
 * setValue((prev) => prev + 5);
 * setValue((prev) => prev * 2);
 *
 * console.log(value()); // 30
 * ```
 *
 * @remarks
 * - Outside `transition(...)`, optimistic writes are scoped to the current
 * microtask.
 * - Inside `transition(...)`, the active optimistic override stays visible until that
 * transition settles.
 * - Multiple writes in the same owner update the same optimistic override.
 * - Newer owners take over older optimistic overrides instead of stacking.
 * - Function overloads fall back to the latest computed source value after the
 * optimistic override clears.
 */
export function optimistic<T>(
  value: T,
  options?: OptimisticOptions<T>,
): readonly [Accessor<T>, Setter<T>];
export function optimistic<T>(
  fn: () => T,
  initialValue?: T,
  options?: OptimisticMemoOptions<T>,
): readonly [Accessor<T>, Setter<T>];
export function optimistic<T>(
  valueOrFn: T | (() => T),
  initialValueOrOptions?: T | OptimisticOptions<T>,
  maybeOptions?: OptimisticMemoOptions<T>,
): readonly [Accessor<T>, Setter<T>] {
  const equals =
    (isOptimisticOptionsLike<T>(initialValueOrOptions)
      ? initialValueOrOptions.equals
      : maybeOptions?.equals) ?? sameValue<T>;

  if (typeof valueOrFn !== "function") {
    const core = new OptimisticCore(() => valueOrFn as T, equals);
    return [core.read, core.set as Setter<T>] as const;
  }

  const source = valueOrFn as () => T;
  const options = isOptimisticOptionsLike<T>(initialValueOrOptions)
    ? initialValueOrOptions
    : maybeOptions;
  const hasInitialValue =
    arguments.length > 1 && !isOptimisticOptionsLike(initialValueOrOptions);
  const node = createComputedNode(source);

  if (hasInitialValue) {
    node.payload = initialValueOrOptions as T;
  }

  if (options?.lazy !== true) {
    readConsumerEager(node);
  }

  const core = new OptimisticCore(
    readConsumerLazy.bind(null, node) as Accessor<T>,
    equals,
  );

  return [core.read, core.set as Setter<T>] as const;
}
