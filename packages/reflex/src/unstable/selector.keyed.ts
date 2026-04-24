import {
  DIRTY_STATE,
  disposeWatcher,
  readProducer,
  registerWatcherCleanup,
  type ReactiveNode,
  runWatcher,
  untracked,
  writeProducer,
} from "@volynets/reflex-runtime";
import {
  createSignalNode,
  createWatcherRankedrNode,
} from "../infra/factory";
import {
  getMissing,
  type KeyedOptions,
  type Missing,
  type ProjectionOptions,
  sameValue,
} from "./selector.shared";

type BooleanSignalNode = ReturnType<typeof createSignalNode<boolean>>;
type ProjectionSignalNode<R> = ReturnType<
  typeof createSignalNode<R | undefined>
>;

class SelectorCore<T> {
  private readonly keyed = new Map<T, BooleanSignalNode>();
  private current: T | Missing = getMissing();
  private currentNode: BooleanSignalNode | null = null;
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

    const current = this.current;
    if (current !== getMissing() && this.equals(current, key)) {
      return readProducer(this.currentNode ?? this.ensureKeyNode(key));
    }

    return readProducer(this.ensureKeyNode(key));
  };

  private sync(next: T = this.source()): void {
    const prev = this.current;

    if (prev !== getMissing() && this.equals(prev, next)) {
      return;
    }

    const prevNode = this.currentNode;
    const nextNode = this.ensureKeyNode(next);
    this.current = next;
    this.currentNode = nextNode;

    if (prevNode !== null) {
      writeProducer(prevNode, false);
    }

    writeProducer(nextNode, true);
  }

  private ensureKeyNode(key: T): BooleanSignalNode {
    const existing = this.keyed.get(key);
    if (existing !== undefined) return existing;

    const node = createSignalNode(
      this.current !== getMissing() && this.equals(this.current, key),
    );
    this.keyed.set(key, node);
    return node;
  }
}

class KeyedProjectionCore<T, K, R> {
  private readonly keyed = new Map<K, ProjectionSignalNode<R>>();
  private currentKey: K | Missing = getMissing();
  private currentNode: ProjectionSignalNode<R> | null = null;
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

    const currentKey = this.currentKey;
    if (currentKey !== getMissing() && this.equals(currentKey, key)) {
      return readProducer(this.currentNode ?? this.ensureKeyNode(key));
    }

    return readProducer(this.ensureKeyNode(key));
  };

  private sync(nextValue: T = this.source()): void {
    const nextKey = this.keyOf(nextValue);
    const prevKey = this.currentKey;
    const nextProjection = this.project(nextValue);

    if (prevKey !== getMissing() && this.equals(prevKey, nextKey)) {
      const currentNode = this.currentNode ?? this.ensureKeyNode(nextKey);
      this.currentNode = currentNode;
      writeProducer(currentNode, nextProjection);
      return;
    }

    const prevNode = this.currentNode;
    const nextNode = this.ensureKeyNode(nextKey);
    this.currentKey = nextKey;
    this.currentNode = nextNode;

    if (prevNode !== null) {
      writeProducer(prevNode, this.fallback);
    }

    writeProducer(nextNode, nextProjection);
  }

  private ensureKeyNode(key: K): ProjectionSignalNode<R> {
    const existing = this.keyed.get(key);
    if (existing !== undefined) return existing;

    const node = createSignalNode(
      this.currentKey !== getMissing() &&
        this.currentNode !== null &&
        this.equals(this.currentKey, key)
        ? this.currentNode.payload
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

export function createKeyedProjection<T, K, R>(
  source: Accessor<T>,
  keyOf: (value: T) => K,
  project: (value: T) => R,
  options: ProjectionOptions<K, R> = {},
): (key: K) => R | undefined {
  const core = new KeyedProjectionCore(
    source,
    keyOf,
    project,
    options.equals ?? sameValue<K>,
    options.fallback,
    options.priority ?? 100,
  );
  return core.read;
}
