import {
  Both,
  createWatcher,
  currentConsumer,
  disposeNode,
  disposeWatcher,
  readProducer,
  runWatcher,
  untracked,
  writeProducer,
  type WatcherNode,
} from "@volynets/reflex-runtime/internal";
import { createSignalNode } from "../internal/runtime";
import { transaction } from "../collections";
import { Demand, Observations } from "../internal/demand";
import { withDispose, type Accessor, type DisposableAccessor } from "../types";
import type { KeyedOptions, ProjectionOptions } from "./shared";

// Map uses SameValueZero. Preserve Object.is semantics for signed zero.
const negativeZero = Symbol("negative zero");
function identityKey<T>(key: T): T | typeof negativeZero {
  return key === 0 && 1 / (key as number) === -Infinity ? negativeZero : key;
}

export function createSelector<T>(
  source: Accessor<T>,
  options: KeyedOptions<T> = {},
): DisposableAccessor<T, boolean> {
  const equals = options.equals ?? Object.is;
  const identityEquality = equals === Object.is;
  type Entry = { key: T; node: ReturnType<typeof createSignalNode<boolean>> };
  const entries = new Map<T | typeof negativeZero, Entry>();
  let watcher: WatcherNode | undefined;
  let current: T;
  let initialized = false;
  let disposed = false;

  const lookup = (key: T): Entry | undefined => {
    if (identityEquality) return entries.get(identityKey(key));
    return untracked(() => {
      for (const entry of entries.values())
        if (equals(entry.key, key)) return entry;
      return undefined;
    });
  };

  const sync = (next: T): void => {
    if (
      initialized &&
      (identityEquality
        ? Object.is(current, next)
        : untracked(() => equals(current, next)))
    )
      return;
    const previous = initialized ? lookup(current) : undefined;
    current = next;
    initialized = true;
    const selected = lookup(next);

    if (!previous && !selected) return;
    transaction(() => {
      if (previous) writeProducer(previous.node, false);
      if (selected) writeProducer(selected.node, true);
    });
  };

  const read = (key: T): boolean => {
    if (disposed) throw new Error("Cannot read a disposed selector");
    if (currentConsumer === null)
      return identityEquality
        ? Object.is(source(), key)
        : untracked(() => equals(source(), key));
    if (!watcher) {
      watcher = createWatcher(() => sync(source()));
      try {
        runWatcher(watcher);
      } catch (error) {
        disposeWatcher(watcher);
        watcher = undefined;
        throw error;
      }
    } else if ((watcher.state & Both) !== 0) {
      sync(untracked(source));
    }

    let entry = lookup(key);

    if (!entry) {
      entry = {
        key,
        node: createSignalNode(
          identityEquality
            ? Object.is(current, key)
            : untracked(() => equals(current, key)),
        ),
      };
      entries.set(identityKey(key), entry);
    }
    return readProducer(entry.node);
  };

  return withDispose(
    Object.assign(read, {
      collect() {
        for (const [key, entry] of entries) {
          if (entry.node.firstOut !== null) continue;
          entries.delete(key);
          disposeNode(entry.node);
        }
        if (entries.size === 0 && watcher) {
          disposeWatcher(watcher);
          watcher = undefined;
          initialized = false;
        }
      },
      dispose() {
        disposed = true;
        if (watcher) disposeWatcher(watcher);
        watcher = undefined;
        for (const entry of entries.values()) disposeNode(entry.node);
        entries.clear();
      },
    }),
    options.name,
  );
}

export function createKeyedProjection<T, K, R>(
  source: Accessor<T>,
  keyOf: (value: T) => K,
  project: (value: T) => R,
  options: ProjectionOptions<K, R> = {},
): DisposableAccessor<K, R | undefined> {
  const keyEquals = options.keyEquals ?? Object.is;
  const valueEquals = options.equals ?? Object.is;
  const sourceValue = new Demand(source);
  const projected = new Demand(() => project(sourceValue.read()));
  const keys = new Observations<K | typeof negativeZero, R | undefined>(
    (key) => {
      const activeKey = keyOf(sourceValue.read());
      const requestedKey = (key === negativeZero ? -0 : key) as K;
      const matches =
        keyEquals === Object.is
          ? Object.is(activeKey, requestedKey)
          : untracked(() => keyEquals(activeKey, requestedKey));
      return matches ? projected.read() : options.fallback;
    },
    valueEquals === Object.is
      ? Object.is
      : (a, b) =>
          a === undefined || b === undefined
            ? Object.is(a, b)
            : valueEquals(a, b),
    options.keyEquals
      ? (a, b) =>
          keyEquals(
            (a === negativeZero ? -0 : a) as K,
            (b === negativeZero ? -0 : b) as K,
          )
      : undefined,
  );
  return withDispose(
    Object.assign((key: K) => keys.read(identityKey(key)), {
      collect() {
        keys.collect();
        projected.collect();
        sourceValue.collect();
      },
      dispose() {
        keys.dispose();
        projected.dispose();
        sourceValue.dispose();
      },
    }),
    options.name,
  );
}
