import { readProducer, writeProducer } from "@volynets/reflex-runtime";
import type { Destructor } from "../types";
import { createSignalNode, effectRanked } from "../internal/runtime";
import {
  cloneProjectionValue,
  isObject,
  type StoreProjectionOptions,
} from "./shared";

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
    this.store = this.getProxy(this.root) as T;

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

  private ensureChild(entry: PathEntry, key: PropertyKey): PathEntry {
    let child = entry.children.get(key);
    if (child !== undefined) return child;

    const parent = entry.node.payload;
    child = this.createPathEntry(
      isObject(parent) ? parent[key as keyof typeof parent] : undefined,
    );
    entry.children.set(key, child);
    return child;
  }

  private getProxy(entry: PathEntry): object {
    const cached = this.proxyCache.get(entry);
    if (cached !== undefined) return cached;

    const proxy = new Proxy(Object.create(null), {
      get: (_target, prop) => {
        if (prop === Symbol.toStringTag) return "ProjectionStore";
        const child = this.ensureChild(entry, prop);
        const value = readProducer(child.node);
        if (!isObject(value)) {
          return value;
        }
        return this.getProxy(child);
      },
      has: (_target, prop) => {
        const parent = readProducer(entry.node);
        return isObject(parent) && prop in parent;
      },
      ownKeys: () => {
        const value = readProducer(entry.node);
        return isObject(value) ? Reflect.ownKeys(value) : [];
      },
      getOwnPropertyDescriptor: (_target, prop) => {
        const value = readProducer(entry.node);
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

    const prevObject = isObject(prevValue) ? prevValue : null;
    const nextObject = isObject(nextValue) ? nextValue : null;

    for (const [key, child] of entry.children) {
      const prevChild =
        prevObject === null ? undefined : prevObject[key as keyof typeof prevObject];
      const nextChild =
        nextObject === null ? undefined : nextObject[key as keyof typeof nextObject];
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
