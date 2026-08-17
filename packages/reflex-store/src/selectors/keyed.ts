import {
  DIRTY_STATE,
  createWatcher,
  readProducer,
  runWatcher,
  untracked,
  writeProducer,
} from "@volynets/reflex-runtime/internal";
import type { Accessor } from "../types";
import { createSignalNode } from "../internal/runtime";
import {
  getMissing,
  type KeyedOptions,
  type Missing,
  type ProjectionOptions,
  sameValue,
} from "./shared";

type BooleanSignalNode = ReturnType<typeof createSignalNode<boolean>>;
type ProjectionSignalNode<R> = ReturnType<
  typeof createSignalNode<R | undefined>
>;

type KeyEntry<K, N> = { key: K; node: N };

function createKeyRegistry<K, N>(
  equals: (prev: K, next: K) => boolean,
  createNode: () => N,
): (key: K) => KeyEntry<K, N> {
  const identityKeys = equals === sameValue<K>;
  const keyed = new Map<K, KeyEntry<K, N>>();
  const entries: Array<KeyEntry<K, N>> = [];

  return (key) => {
    if (identityKeys) {
      const existing = keyed.get(key);
      if (existing !== undefined) return existing;
      const entry = { key, node: createNode() };
      keyed.set(key, entry);
      return entry;
    }

    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]!;
      if (equals(entry.key, key)) return entry;
    }

    const entry = { key, node: createNode() };
    entries.push(entry);
    return entry;
  };
}

export function createSelector<T>(
  source: Accessor<T>,
  options: KeyedOptions<T> = {},
): (key: T) => boolean {
  const equals = options.equals ?? sameValue<T>;
  let current: T | Missing = getMissing();
  let currentEntry: KeyEntry<T, BooleanSignalNode> | null = null;
  const ensureKey = createKeyRegistry(equals, () => createSignalNode(false));

  const sync = (next: T = source()): void => {
    if (current !== getMissing() && equals(current, next)) return;

    const previous = currentEntry;
    const nextEntry = ensureKey(next);
    current = next;
    currentEntry = nextEntry;
    if (previous !== null) writeProducer(previous.node, false);
    writeProducer(nextEntry.node, true);
  };

  const watcher = createWatcher(() => sync());
  runWatcher(watcher);

  return (key) => {
    if ((watcher.state & DIRTY_STATE) !== 0) sync(untracked(source));
    return readProducer(ensureKey(key).node);
  };
}

export function createKeyedProjection<T, K, R>(
  source: Accessor<T>,
  keyOf: (value: T) => K,
  project: (value: T) => R,
  options: ProjectionOptions<K, R> = {},
): (key: K) => R | undefined {
  const keyEquals = options.keyEquals ?? sameValue<K>;
  const valueEquals = options.equals ?? sameValue<R>;
  const fallback = options.fallback;
  let currentKey: K | Missing = getMissing();
  let currentEntry: KeyEntry<K, ProjectionSignalNode<R>> | null = null;
  const ensureKey = createKeyRegistry(keyEquals, () =>
    createSignalNode<R | undefined>(fallback),
  );

  const writeValue = (node: ProjectionSignalNode<R>, value: R | undefined) => {
    if (
      value !== undefined &&
      node.payload !== undefined &&
      valueEquals(node.payload, value)
    )
      return;
    writeProducer(node, value);
  };

  const sync = (nextValue: T = source()): void => {
    const nextKey = keyOf(nextValue);
    const nextProjection = project(nextValue);

    if (currentKey !== getMissing() && keyEquals(currentKey, nextKey)) {
      writeValue(currentEntry!.node, nextProjection);
      return;
    }

    const previous = currentEntry;
    const nextEntry = ensureKey(nextKey);
    currentKey = nextKey;
    currentEntry = nextEntry;
    if (previous !== null) writeValue(previous.node, fallback);
    writeValue(nextEntry.node, nextProjection);
  };

  const watcher = createWatcher(() => sync());
  runWatcher(watcher);

  return (key) => {
    if ((watcher.state & DIRTY_STATE) !== 0) sync(untracked(source));
    return readProducer(ensureKey(key).node);
  };
}
