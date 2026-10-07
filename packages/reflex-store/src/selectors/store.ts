import {
  currentConsumer,
  setCurrentConsumer,
  untracked,
} from "@volynets/reflex-runtime/internal";
import { Demand, Observations } from "../internal/demand";
import { cloneValue, depthOf, isStructural, storeControls } from "../values";
import type { StoreDisposable } from "../types";
import { storeName } from "../internal/names";
import { readProjectionPath, type StoreProjectionOptions } from "./shared";

const sameKeys = (a: readonly PropertyKey[], b: readonly PropertyKey[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

class Projection<T extends object> {
  readonly state: Demand<T>;
  private readonly views = new Set<WeakRef<View>>();
  private disposed = false;

  constructor(
    fn: (draft: T) => void | T,
    seed: Partial<T>,
    readonly options: StoreProjectionOptions<T>,
    returnsValue = false,
  ) {
    const clone: (value: T) => T = options.clone ?? cloneValue;
    let initialSeed: Partial<T> | undefined = seed;
    let current: T;
    let initialized = false;
    this.state = new Demand(() => {
      const draft = returnsValue
        ? (undefined as unknown as T)
        : untracked(() => clone(initialized ? current : (initialSeed as T)));
      const result = fn(draft);
      const next =
        result === undefined ? draft : untracked(() => clone(result));
      const equals = options.equals;
      if (
        !initialized ||
        !(equals === undefined || equals === Object.is
          ? Object.is(current, next)
          : untracked(() => equals(current, next)))
      )
        current = next;
      initialSeed = undefined;
      initialized = true;
      return current;
    });
  }

  view(path: readonly PropertyKey[], array: boolean): View {
    const view = new View(this, path, array);
    this.views.add(new WeakRef(view));
    return view;
  }

  read(path: readonly PropertyKey[]): unknown {
    if (this.disposed)
      throw new Error("Cannot read a disposed store projection");
    const value = this.state.read();
    return path.length === 0 ? value : readProjectionPath(value, path);
  }

  collect(): void {
    for (const ref of this.views) {
      const view = ref.deref();
      if (view) view.collect();
      else this.views.delete(ref);
    }
    this.state.collect();
  }

  dispose(): void {
    this.disposed = true;
    for (const ref of this.views) ref.deref()?.dispose();
    this.views.clear();
    this.state.dispose();
  }
}

interface ProjectionOwner {
  readonly options: { depth?: "deep" | "shallow"; name?: string };
  read(path: readonly PropertyKey[]): unknown;
  view(path: readonly PropertyKey[], array: boolean): View;
  collect(): void;
  dispose(): void;
}

class View {
  readonly proxy: object;
  private readonly children = new Map<
    PropertyKey,
    { array: boolean; view: WeakRef<View> }
  >();
  private values?: Observations<PropertyKey, unknown>;
  private exists?: Observations<PropertyKey, boolean>;
  private descriptors?: Observations<PropertyKey, boolean | undefined>;
  private keys?: Observations<undefined, readonly (string | symbol)[]>;

  constructor(
    private readonly owner: ProjectionOwner,
    private readonly path: readonly PropertyKey[],
    array: boolean,
  ) {
    const read = () => owner.read(path);
    const parent = () => {
      const value = read();
      return typeof value === "object" && value !== null ? value : undefined;
    };
    const get = (key: PropertyKey): unknown => {
      const value = parent();
      return value === undefined ? undefined : Reflect.get(value, key);
    };
    const valueAt = (key: PropertyKey) => {
      const value = parent();
      return this.wrap(
        key,
        value === undefined ? undefined : Reflect.get(value, key),
        value,
      );
    };
    const existsAt = (key: PropertyKey) => {
      const value = parent();
      return value !== undefined && key in value;
    };
    const descriptorAt = (key: PropertyKey) => {
      const value = parent();
      return value === undefined
        ? undefined
        : Object.getOwnPropertyDescriptor(value, key)?.enumerable;
    };
    const keysAt = () => {
      const value = parent();
      return value === undefined ? [] : Reflect.ownKeys(value);
    };
    const dispose = () => owner.dispose();

    this.proxy = new Proxy(array ? [] : Object.create(null), {
      get: (_target, key) => {
        if (key === storeName) return owner.options.name;
        if (key === Symbol.dispose) return dispose;
        // Inspect one parent snapshot without subscribing to structural identity.
        const previous = currentConsumer;
        let container: object | undefined;
        let value: unknown;
        setCurrentConsumer(null);
        try {
          container = parent();
          value =
            container === undefined ? undefined : Reflect.get(container, key);
        } finally {
          setCurrentConsumer(previous);
        }
        if (this.shouldWrap(value, container))
          return this.child(key, Array.isArray(value));
        return (this.values ??= new Observations(valueAt)).read(key);
      },
      has: (_target, key) =>
        (this.exists ??= new Observations(existsAt)).read(key),
      ownKeys: () => {
        const keys = (this.keys ??= new Observations<
          undefined,
          readonly (string | symbol)[]
        >(keysAt, sameKeys)).read(undefined);
        return array && !keys.includes("length")
          ? [...keys, "length"]
          : [...keys];
      },
      getOwnPropertyDescriptor: (_target, key) => {
        const enumerable = (this.descriptors ??= new Observations(
          descriptorAt,
        )).read(key);
        if (array && key === "length")
          return {
            configurable: false,
            enumerable: false,
            writable: true,
            value: untracked(() => get(key)) ?? 0,
          };
        if (enumerable === undefined) return undefined;
        return {
          configurable: true,
          enumerable,
          writable: false,
          value: untracked(() => get(key)),
        };
      },
      set: () => false,
      deleteProperty: () => false,
      defineProperty: () => false,
      setPrototypeOf: () => false,
      preventExtensions: () => false,
    });
    storeControls.set(this.proxy, {
      raw: read,
      collect: () => owner.collect(),
      dispose,
    });
  }

  private shouldWrap(value: unknown, parent: object | undefined): boolean {
    return (
      this.owner.options.depth !== "shallow" &&
      (parent === undefined || depthOf(parent) !== "shallow") &&
      isStructural(value)
    );
  }

  private wrap(
    key: PropertyKey,
    value: unknown,
    parent: object | undefined,
  ): unknown {
    return this.shouldWrap(value, parent)
      ? this.child(key, Array.isArray(value))
      : value;
  }

  private child(key: PropertyKey, array: boolean): object {
    const existing = this.children.get(key);
    const cached = existing?.view.deref();
    if (cached && existing!.array === array) return cached.proxy;
    const view = this.owner.view([...this.path, key], array);
    this.children.set(key, { array, view: new WeakRef(view) });
    return view.proxy;
  }

  collect(): void {
    this.values?.collect();
    this.exists?.collect();
    this.descriptors?.collect();
    this.keys?.collect();
    for (const [key, entry] of this.children)
      if (!entry.view.deref()) this.children.delete(key);
  }

  dispose(): void {
    this.values?.dispose();
    this.exists?.dispose();
    this.descriptors?.dispose();
    this.keys?.dispose();
    this.children.clear();
  }
}

export function createStoreProjection<T extends object>(
  fn: (draft: T) => void | T,
  seed: Partial<T>,
  options: StoreProjectionOptions<T> = {},
): T & StoreDisposable {
  const owner = new Projection(fn, seed, options);
  return owner.view([], Array.isArray(seed)).proxy as T & StoreDisposable;
}

/** Pure-return derivations never consume a mutable draft of their previous state. */
export function createDerivedProjection<T extends object>(
  compute: () => T,
  options: StoreProjectionOptions<T>,
): T & StoreDisposable {
  const owner = new Projection(compute, {}, options, true);
  return owner.view([], false).proxy as T & StoreDisposable;
}
