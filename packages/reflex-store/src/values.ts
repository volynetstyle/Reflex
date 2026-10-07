import type { StoreBoundary } from "./store/boundaries";
import type { CompiledStore, StoreShape, StoreData } from "./store/createStore";
import type { ReactiveMap, ReactiveSet } from "./collections";
import { untracked } from "@volynets/reflex-runtime/internal";

export type Depth = "deep" | "shallow" | "ref" | "opaque";
const depths = new WeakMap<object, Depth>();
function mark<T extends object>(value: T, depth: Depth): T {
  depths.set(value, depth);
  return value;
}
export const deep = <T extends object>(value: T): T => mark(value, "deep");
export const shallow = <T extends object>(value: T): T =>
  mark(value, "shallow");
export const ref = <T extends object>(value: T): T => mark(value, "ref");
export const opaque = <T extends object>(value: T): StoreBoundary<T> =>
  mark(value, "opaque") as StoreBoundary<T>;
export function depthOf(value: object): Depth {
  return depths.get(value) ?? "deep";
}
export function isPlain(value: unknown): value is Record<PropertyKey, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return Array.isArray(value) || proto === Object.prototype || proto === null;
}
export function isStructural(
  value: unknown,
): value is Record<PropertyKey, unknown> {
  return isPlain(value) && isStructuralDepth(depthOf(value));
}

function isStructuralDepth(depth: Depth): boolean {
  return depth !== "ref" && depth !== "opaque";
}

/** Copy structural data, retaining explicit reference boundaries and foreign objects. */
export function cloneValue<T>(value: T, seen = new Map<object, unknown>()): T {
  if (!isPlain(value)) return value;
  const depth = depthOf(value);
  if (!isStructuralDepth(depth)) return value;
  if (seen.has(value)) return seen.get(value) as T;
  const array = Array.isArray(value);
  const result = (
    array ? [] : Object.create(Object.getPrototypeOf(value))
  ) as Record<PropertyKey, unknown>;
  seen.set(value, result);
  if (depth !== "deep") depths.set(result, depth);
  const output = {
    configurable: true,
    enumerable: true,
    writable: true,
    value: undefined as unknown,
  };
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === "length") continue;
    output.enumerable = Object.getOwnPropertyDescriptor(
      value,
      key,
    )!.enumerable!;
    output.value =
      depth === "shallow" ? value[key] : cloneValue(value[key], seen);
    Object.defineProperty(result, key, output);
  }
  if (array) (result as unknown as unknown[]).length = value.length;
  return result as T;
}

export interface StoreControl {
  raw(): unknown;
  snapshot?(data: unknown, copy: (value: unknown) => unknown): unknown;
  collect(): void;
  dispose(): void;
  paths?: readonly (readonly string[])[];
  branches?: readonly (readonly string[])[];
  hydrate?(values: readonly unknown[]): void;
}
export function getStoreControl(store: object): StoreControl | undefined {
  return (
    storeControls.get(store) ??
    (store as Record<symbol, StoreControl>)[
      Symbol.for("@volynets/reflex-store/data/1")
    ]
  );
}
export const storeControls = new WeakMap<object, StoreControl>();

/** An untracked backing view. Mutating it bypasses reactivity and is unsupported. */
export function raw<K, V>(store: ReactiveMap<K, V>): Map<K, V>;
export function raw<T>(store: ReactiveSet<T>): Set<T>;
export function raw<T>(store: T): T;
export function raw<T>(store: T): T {
  return untracked(() => {
    const control =
      typeof store === "object" && store !== null
        ? getStoreControl(store)
        : undefined;
    return (control ? control.raw() : store) as T;
  });
}

export type Snapshot<T> =
  T extends ReactiveSet<infer V>
    ? ReadonlySet<V>
    : T extends Set<infer V>
      ? ReadonlySet<V>
      : T extends ReactiveMap<infer K, infer V>
        ? ReadonlyMap<K, Snapshot<V>>
        : T extends Map<infer K, infer V>
          ? ReadonlyMap<K, Snapshot<V>>
          : T extends readonly (infer V)[]
            ? readonly Snapshot<V>[]
            : T extends object
              ? { readonly [K in keyof T]: Snapshot<T[K]> }
              : T;

/** An untracked point-in-time copy. Opaque/foreign values remain by reference. */
export function snapshot<T extends StoreShape>(
  store: CompiledStore<T>,
): Snapshot<StoreData<T>>;
export function snapshot<T>(store: T): Snapshot<T>;
export function snapshot<T>(store: T): Snapshot<T> {
  // Snapshot copies shallow/ref plain data too; opaque data cannot be serialized generically.
  const seen = new Map<object, unknown>();
  const copy = (value: unknown): unknown => {
    if (
      typeof value === "object" &&
      value !== null &&
      depthOf(value) === "opaque"
    )
      return value;
    if (value instanceof Set) {
      if (seen.has(value)) return seen.get(value);
      const result = new Set(value);
      seen.set(value, result);
      const immutable = () => {
        throw new TypeError("Cannot mutate a snapshot");
      };
      Object.defineProperties(result, {
        add: { value: immutable },
        delete: { value: immutable },
        clear: { value: immutable },
      });
      return Object.freeze(result);
    }
    if (value instanceof Map) {
      if (seen.has(value)) return seen.get(value);
      const result = new Map();
      seen.set(value, result);
      for (const [key, item] of value) result.set(key, copy(item));
      const immutable = () => {
        throw new TypeError("Cannot mutate a snapshot");
      };
      Object.defineProperties(result, {
        set: { value: immutable },
        delete: { value: immutable },
        clear: { value: immutable },
      });
      return Object.freeze(result);
    }
    if (!isPlain(value) || depthOf(value) === "opaque") return value;
    if (seen.has(value)) return seen.get(value);
    const array = Array.isArray(value);
    const result = (
      array ? [] : Object.create(Object.getPrototypeOf(value))
    ) as Record<PropertyKey, unknown>;
    seen.set(value, result);
    const output = { enumerable: true, value: undefined as unknown };
    for (const key of Reflect.ownKeys(value)) {
      if (array && key === "length") continue;
      output.enumerable = Object.getOwnPropertyDescriptor(
        value,
        key,
      )!.enumerable!;
      output.value = copy(value[key]);
      Object.defineProperty(result, key, output);
    }
    if (array) (result as unknown as unknown[]).length = value.length;
    return Object.freeze(result);
  };
  return untracked(() => {
    const control =
      typeof store === "object" && store !== null
        ? getStoreControl(store)
        : undefined;
    // Capture every cell before cloning user values, preserving point-in-time reads.
    const data = control ? control.raw() : store;
    return control?.snapshot ? control.snapshot(data, copy) : copy(data);
  }) as Snapshot<T>;
}

export function disposeStore(store: object): void {
  const control = getStoreControl(store);
  if (!control) throw new TypeError("Expected a runtime store or projection");
  control.dispose();
}

/** Reclaim locations with no consumers at an explicit owner lifecycle boundary. */
export function collectStore(store: object): void {
  const control = getStoreControl(store);
  if (!control) throw new TypeError("Expected a runtime store or projection");
  control.collect();
}
