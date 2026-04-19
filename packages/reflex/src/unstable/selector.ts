import {
  DIRTY_STATE,
  disposeWatcher,
  registerWatcherCleanup,
  readProducer,
  type ReactiveNode,
  untracked,
  runWatcher,
  writeProducer,
} from "@reflex/runtime";
import { createSignalNode, createWatcherRankedrNode } from "../infra";

const MISSING = Symbol("selector.missing");

type Missing = typeof MISSING;

export interface KeyedOptions<T> {
  equals?: (prev: T, next: T) => boolean;
  priority?: number;
}

export interface ProjectionOptions<K, R> extends KeyedOptions<K> {
  fallback?: R;
}

function sameValue<T>(prev: T, next: T): boolean {
  return Object.is(prev, next);
}

class SelectorCore<T> {
  private readonly keyed = new Map<
    T,
    ReturnType<typeof createSignalNode<boolean>>
  >();
  private current: T | Missing = MISSING;
  private readonly watcher: ReactiveNode;
  private readonly dispose: Destructor;

  constructor(
    private readonly source: Accessor<T>,
    private readonly equals: (prev: T, next: T) => boolean,
    priority: number,
  ) {
    const watcher = createWatcherRankedrNode(() => {
      this.sync();
    }, priority);
    this.watcher = watcher;
    runWatcher(watcher);
    this.dispose = disposeWatcher.bind(null, watcher) as Destructor;
    registerWatcherCleanup(this.dispose);
  }

  read = (key: T): boolean => {
    if ((this.watcher.state & DIRTY_STATE) !== 0) {
      this.sync(untracked(this.source));
    }
    return readProducer(this.ensureKeyNode(key));
  };

  private sync(next: T = this.source()): void {
    const prev = this.current;

    if (prev !== MISSING && this.equals(prev, next)) {
      return;
    }

    this.current = next;

    if (prev !== MISSING) {
      const prevNode = this.keyed.get(prev);
      if (prevNode !== undefined) {
        writeProducer(prevNode, false);
      }
    }

    writeProducer(this.ensureKeyNode(next), true);
  }

  private ensureKeyNode(key: T) {
    const existing = this.keyed.get(key);
    if (existing !== undefined) return existing;

    const node = createSignalNode(
      this.current !== MISSING && this.equals(this.current, key),
    );
    this.keyed.set(key, node);
    return node;
  }
}

class ProjectionCore<T, K, R> {
  private readonly keyed = new Map<
    K,
    ReturnType<typeof createSignalNode<R | undefined>>
  >();
  private currentKey: K | Missing = MISSING;
  private readonly watcher: ReactiveNode;
  private readonly dispose: Destructor;

  constructor(
    private readonly source: Accessor<T>,
    private readonly keyOf: (value: T) => K,
    private readonly project: (value: T) => R,
    private readonly equals: (prev: K, next: K) => boolean,
    private readonly fallback: R | undefined,
    priority: number,
  ) {
    const watcher = createWatcherRankedrNode(() => {
      this.sync();
    }, priority);
    this.watcher = watcher;
    runWatcher(watcher);
    this.dispose = disposeWatcher.bind(null, watcher) as Destructor;
    registerWatcherCleanup(this.dispose);
  }

  read = (key: K): R | undefined => {
    if ((this.watcher.state & DIRTY_STATE) !== 0) {
      this.sync(untracked(this.source));
    }
    return readProducer(this.ensureKeyNode(key));
  };

  private sync(nextValue: T = this.source()): void {
    const nextKey = this.keyOf(nextValue);
    const prevKey = this.currentKey;

    if (prevKey !== MISSING && this.equals(prevKey, nextKey)) {
      writeProducer(this.ensureKeyNode(nextKey), this.project(nextValue));
      return;
    }

    this.currentKey = nextKey;

    if (prevKey !== MISSING) {
      writeProducer(this.ensureKeyNode(prevKey), this.fallback);
    }

    writeProducer(this.ensureKeyNode(nextKey), this.project(nextValue));
  }

  private ensureKeyNode(key: K) {
    const existing = this.keyed.get(key);
    if (existing !== undefined) return existing;

    const node = createSignalNode(
      this.currentKey !== MISSING && this.equals(this.currentKey, key)
        ? this.fallback
        : this.fallback,
    );
    this.keyed.set(key, node);
    return node;
  }
}

export function createSelector<T>(
  source: Accessor<T>,
  options: KeyedOptions<T> = {},
): (key: T) => boolean {
  const core = new SelectorCore(
    source,
    options.equals ?? sameValue<T>,
    options.priority ?? 100,
  );
  return core.read;
}

export function createProjection<T, K, R>(
  source: Accessor<T>,
  keyOf: (value: T) => K,
  project: (value: T) => R,
  options: ProjectionOptions<K, R> = {},
): (key: K) => R | undefined {
  const core = new ProjectionCore(
    source,
    keyOf,
    project,
    options.equals ?? sameValue<K>,
    options.fallback,
    options.priority ?? 100,
  );
  return core.read;
}
