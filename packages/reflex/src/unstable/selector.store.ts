import { readProducer, writeProducer } from "@reflex/runtime";
import { effectRanked } from "../api/effect";
import { createSignalNode } from "../infra/factory";
import {
  cloneProjectionValue,
  isObject,
  readProjectionPath,
  type StoreProjectionOptions,
} from "./selector.shared";

type PathEntry = {
  node: ReturnType<typeof createSignalNode<unknown>>;
  children: Map<PropertyKey, PathEntry>;
};

class StoreProjectionCore<T extends object> {
  readonly store: T;
  private state: T;
  private readonly root: PathEntry;
  private readonly proxyCache = new WeakMap<PathEntry, object>();
  private readonly dispose: Destructor;

  constructor(
    fn: (draft: T) => void | T,
    seed: Partial<T>,
    options: StoreProjectionOptions<T>,
  ) {
    const clone = options.clone ?? cloneProjectionValue<T>;
    this.state = clone(seed as T);
    this.root = this.createPathEntry(this.state);
    this.store = this.getProxy(this.root, []) as T;

    this.dispose = effectRanked(
      () => {
        const draft = clone(this.state);
        const result = fn(draft);
        const nextState = (result === undefined ? draft : clone(result)) as T;
        this.commit(nextState);
      },
      { priority: options.priority ?? 100 },
    );
  }

  read(): T {
    return this.store;
  }

  stop(): void {
    this.dispose();
  }

  private createPathEntry(value: unknown): PathEntry {
    return {
      node: createSignalNode(value),
      children: new Map(),
    };
  }

  private ensurePathEntry(path: readonly PropertyKey[]): PathEntry {
    let entry = this.root;

    for (let index = 0; index < path.length; ++index) {
      const key = path[index]!;
      let nextEntry = entry.children.get(key);
      if (nextEntry === undefined) {
        nextEntry = this.createPathEntry(
          readProjectionPath(this.state, path.slice(0, index + 1)),
        );
        entry.children.set(key, nextEntry);
      }
      entry = nextEntry;
    }

    return entry;
  }

  private readPath(path: readonly PropertyKey[]): unknown {
    const entry = this.ensurePathEntry(path);
    return readProducer(entry.node);
  }

  private getProxy(entry: PathEntry, path: readonly PropertyKey[]): object {
    const cached = this.proxyCache.get(entry);
    if (cached !== undefined) return cached;

    const proxy = new Proxy(Object.create(null), {
      get: (_target, prop) => {
        if (prop === Symbol.toStringTag) return "ProjectionStore";
        const nextPath = [...path, prop];
        const value = this.readPath(nextPath);
        if (!isObject(value)) {
          return value;
        }
        return this.getProxy(this.ensurePathEntry(nextPath), nextPath);
      },
      has: (_target, prop) => {
        const parent = this.readPath(path);
        return isObject(parent) && prop in parent;
      },
      ownKeys: () => {
        const value = this.readPath(path);
        return isObject(value) ? Reflect.ownKeys(value) : [];
      },
      getOwnPropertyDescriptor: (_target, prop) => {
        const value = this.readPath(path);
        if (!isObject(value) || !(prop in value)) {
          return undefined;
        }

        return {
          configurable: true,
          enumerable: true,
          value: value[prop as keyof typeof value],
          writable: false,
        };
      },
      set: () => false,
      deleteProperty: () => false,
    });

    this.proxyCache.set(entry, proxy);
    return proxy;
  }

  private commit(nextState: T): void {
    const prevState = this.state;
    this.state = nextState;
    this.diffEntry(this.root, prevState, nextState);
  }

  private diffEntry(
    entry: PathEntry,
    prevValue: unknown,
    nextValue: unknown,
  ): void {
    if (!Object.is(prevValue, nextValue)) {
      writeProducer(entry.node, nextValue);
    }

    if (entry.children.size === 0) return;

    for (const [key, child] of entry.children) {
      const prevChild =
        isObject(prevValue) && key in prevValue
          ? prevValue[key as keyof typeof prevValue]
          : undefined;
      const nextChild =
        isObject(nextValue) && key in nextValue
          ? nextValue[key as keyof typeof nextValue]
          : undefined;
      this.diffEntry(child, prevChild, nextChild);
    }
  }
}

export function createStoreProjection<T extends object>(
  fn: (draft: T) => void | T,
  seed: Partial<T>,
  options: StoreProjectionOptions<T> = {},
): T {
  const core = new StoreProjectionCore(fn, seed, options);
  return core.read();
}
