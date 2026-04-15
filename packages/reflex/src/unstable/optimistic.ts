import {
  getDefaultContext,
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

interface OptimisticLayer<T> {
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
  private readonly context = getDefaultContext();
  private readonly stateNode = createResourceStateNode();
  private readonly layers: OptimisticLayer<T>[] = [];
  private readonly registeredTransitions = new WeakSet<OptimisticTransition>();

  private disposed = false;

  constructor(
    private readonly base: Accessor<T>,
    private readonly equals: (prev: T, next: T) => boolean,
  ) {
    this.context.registerWatcherCleanup(() => {
      this.dispose();
    });
  }

  read = (): T => {
    readProducer(this.stateNode);

    const layer = this.peekLayer();
    return layer ? layer.value : this.base();
  };

  set = (input: SetInput<T>): T => {
    const prev = this.peek();
    const next = typeof input === "function" ? input(prev) : input;

    if (this.disposed) {
      return next;
    }

    const owner = activeTransition ?? this.createMicrotaskOwner();
    const index = this.findLayerIndex(owner);

    if (index >= 0) {
      const layer = this.layers[index]!;

      if (this.equals(layer.value, next)) {
        return next;
      }

      const wasTop = index === this.layers.length - 1;
      layer.value = next;

      if (wasTop && !this.equals(prev, next)) {
        this.bump();
      }

      return next;
    }

    this.layers.push({ owner, value: next });

    if (owner instanceof OptimisticTransition) {
      this.registerTransition(owner);
    }

    if (!this.equals(prev, next)) {
      this.bump();
    }

    return next;
  };

  private peek(): T {
    const layer = this.peekLayer();
    return layer ? layer.value : untracked(this.base);
  }

  private peekLayer(): OptimisticLayer<T> | undefined {
    return this.layers[this.layers.length - 1];
  }

  private findLayerIndex(owner: object): number {
    for (let i = this.layers.length - 1; i >= 0; --i) {
      if (this.layers[i]?.owner === owner) return i;
    }

    return -1;
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

    const previous = this.peek();
    const index = this.findLayerIndex(owner);
    if (index < 0) return;

    this.layers.splice(index, 1);

    const next = this.peek();
    if (!this.equals(previous, next)) {
      this.bump();
    }
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.layers.length === 0) return;

    this.layers.length = 0;
    this.bump();
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
 * fallback from a tracked memo-like computation and temporarily overlay
 * optimistic writes on top.
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
 * - Inside `transition(...)`, the optimistic layer stays visible until that
 * transition settles.
 * - Multiple writes in the same owner update the same optimistic layer.
 * - Function overloads fall back to the latest computed source value after the
 * optimistic layer clears.
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
