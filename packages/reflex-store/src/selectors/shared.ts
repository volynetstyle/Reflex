const MISSING = Symbol("selector.missing");

type AnyRecord = Record<PropertyKey, unknown>;

export type Missing = typeof MISSING;

export interface KeyedOptions<T> {
  equals?: (prev: T, next: T) => boolean;
}

export interface ProjectionOptions<K, R> {
  keyEquals?: (prev: K, next: K) => boolean;
  equals?: (prev: R, next: R) => boolean;
  fallback?: R;
}

export interface StoreProjectionOptions<T extends object> {
  clone?: (value: T) => T;
  equals?: (previous: T, next: T) => boolean;
  depth?: "deep" | "shallow";
}

export function sameValue<T>(prev: T, next: T): boolean {
  return Object.is(prev, next);
}

export function getMissing(): Missing {
  return MISSING;
}

export function isObject(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null;
}

export { cloneValue as cloneProjectionValue } from "../values";

export function readProjectionPath(
  value: unknown,
  path: readonly PropertyKey[],
): unknown {
  let current = value;

  for (let index = 0; index < path.length; ++index) {
    if (!isObject(current)) return undefined;
    current = current[path[index] as keyof typeof current];
  }

  return current;
}

export function createStoreReaderProxy<T extends object>(
  readState: () => T,
  path: readonly PropertyKey[] = [],
): T {
  return new Proxy(Object.create(null) as T, {
    get(_target, prop) {
      if (prop === Symbol.toStringTag) return "ProjectionStore";
      const value = readProjectionPath(readState(), [...path, prop]);
      return isObject(value)
        ? createStoreReaderProxy(readState, [...path, prop])
        : value;
    },
    has(_target, prop) {
      const parent = readProjectionPath(readState(), path);
      return isObject(parent) && prop in parent;
    },
    ownKeys() {
      const value = readProjectionPath(readState(), path);
      return isObject(value) ? Reflect.ownKeys(value) : [];
    },
    getOwnPropertyDescriptor(_target, prop) {
      const parent = readProjectionPath(readState(), path);
      if (!isObject(parent) || !(prop in parent)) {
        return undefined;
      }

      return {
        configurable: true,
        enumerable: true,
        value: parent[prop as keyof typeof parent],
        writable: false,
      };
    },
    set() {
      return false;
    },
    deleteProperty() {
      return false;
    },
  });
}
