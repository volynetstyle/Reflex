import { untracked } from "@volynets/reflex-runtime/internal";
import { Demand, Observations } from "../internal/demand";
import { cloneValue, depthOf, isStructural, storeControls } from "../values";
import type { StoreDisposable } from "../types";
import { storeName } from "../internal/names";
import { readProjectionPath, type StoreProjectionOptions } from "./shared";

const sameKeys = (a: readonly PropertyKey[], b: readonly PropertyKey[]) =>
  a.length === b.length && a.every((key, index) => key === b[index]);

class Projection<T extends object> {
  readonly state: Demand<T>;
  private readonly views = new Set<WeakRef<View>>();
  private disposed = false;

  constructor(
    fn: (draft: T) => void | T,
    seed: Partial<T>,
    readonly options: StoreProjectionOptions<T>,
  ) {
    const clone: (value: T) => T = options.clone ?? cloneValue;
    let initialSeed: Partial<T> | undefined = seed;
    let current: T;
    let initialized = false;
    this.state = new Demand(() => {
      const draft = untracked(() =>
        clone(initialized ? current : (initialSeed as T)),
      );
      const result = fn(draft);
      const next =
        result === undefined ? draft : untracked(() => clone(result));
      if (
        !initialized ||
        !untracked(() => (options.equals ?? Object.is)(current, next))
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
    return readProjectionPath(this.state.read(), path);
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
  private readonly values: Observations<PropertyKey, unknown>;
  private readonly exists: Observations<PropertyKey, boolean>;
  private readonly descriptors: Observations<PropertyKey, boolean | undefined>;
  private readonly keys: Observations<undefined, readonly (string | symbol)[]>;

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
    this.values = new Observations((key) => this.wrap(key, get(key), parent()));
    this.exists = new Observations((key) => {
      const value = parent();
      return value !== undefined && key in value;
    });
    this.descriptors = new Observations((key) => {
      const value = parent();
      return value === undefined
        ? undefined
        : Object.getOwnPropertyDescriptor(value, key)?.enumerable;
    });
    this.keys = new Observations<undefined, readonly (string | symbol)[]>(
      () => {
        const value = parent();
        return value === undefined ? [] : Reflect.ownKeys(value);
      },
      sameKeys,
    );

    this.proxy = new Proxy(array ? [] : Object.create(null), {
      get: (_target, key) => {
        if (key === storeName) return this.owner.options.name;
        if (key === Symbol.dispose) return () => this.owner.dispose();
        // Navigating a structural object does not subscribe to its identity.
        // The eventual leaf/exists/keys access owns the semantic dependency.
        const value = untracked(() => get(key));
        const container = untracked(parent);
        if (this.shouldWrap(value, container))
          return this.child(key, Array.isArray(value));
        return this.values.read(key);
      },
      has: (_target, key) => this.exists.read(key),
      ownKeys: () => {
        const keys = this.keys.read(undefined);
        return array && !keys.includes("length")
          ? [...keys, "length"]
          : [...keys];
      },
      getOwnPropertyDescriptor: (_target, key) => {
        const enumerable = this.descriptors.read(key);
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
      dispose: () => owner.dispose(),
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
    this.values.collect();
    this.exists.collect();
    this.descriptors.collect();
    this.keys.collect();
    for (const [key, entry] of this.children)
      if (!entry.view.deref()) this.children.delete(key);
  }

  dispose(): void {
    this.values.dispose();
    this.exists.dispose();
    this.descriptors.dispose();
    this.keys.dispose();
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
