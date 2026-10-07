import { transaction } from "./collections";
import { depthOf, getStoreControl, isPlain, type Snapshot } from "./values";
import { untracked } from "@volynets/reflex-runtime/internal";
import type { CompiledStore, StoreShape, StoreData } from "./store/createStore";

/** Restore all compiled data fields after validating the complete static schema. */
export function hydrate<T extends StoreShape>(
  store: CompiledStore<T>,
  data: Snapshot<StoreData<T>>,
): void {
  const control = getStoreControl(store);
  if (!control?.hydrate || !control.paths || !control.branches)
    throw new TypeError("hydrate() requires a compiled store");
  untracked(() => {
    const values = new Map<string, unknown>();
    const seen = new Map<object, unknown>();
    for (const path of control.branches!) {
      const branch = readPath(data, path);
      if (!isPlain(branch) || Array.isArray(branch))
        throw new TypeError("Invalid hydration branch: " + path.join("."));
      const expected = new Set<string>();
      for (const candidate of [...control.paths!, ...control.branches!])
        if (
          candidate.length === path.length + 1 &&
          path.every((key, index) => candidate[index] === key)
        )
          expected.add(candidate[path.length]!);
      const actual = Reflect.ownKeys(branch);
      if (
        actual.length !== expected.size ||
        actual.some((key) => typeof key !== "string" || !expected.has(key))
      )
        throw new TypeError(
          "Hydration data does not match the compiled store shape",
        );
    }
    for (const path of control.paths!)
      values.set(
        JSON.stringify(path),
        restoreValue(readPath(data, path), seen),
      );
    const ordered = control.paths!.map((path) =>
      values.get(JSON.stringify(path)),
    );
    transaction(() => control.hydrate!(ordered));
  });
}

function restoreValue(value: unknown, seen: Map<object, unknown>): unknown {
  if (
    value === null ||
    typeof value !== "object" ||
    depthOf(value) === "opaque"
  )
    return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Map) {
    const result = new Map();
    seen.set(value, result);
    for (const [key, item] of value) result.set(key, restoreValue(item, seen));
    return result;
  }
  if (value instanceof Set) {
    const result = new Set(value);
    seen.set(value, result);
    return result;
  }
  if (!isPlain(value)) return value;
  const result = (
    Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value))
  ) as Record<PropertyKey, unknown>;
  seen.set(value, result);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor))
      throw new TypeError("Hydration values must contain data properties");
    Object.defineProperty(result, key, {
      configurable: true,
      writable: true,
      enumerable: descriptor.enumerable,
      value: restoreValue(descriptor.value, seen),
    });
  }
  if (Array.isArray(value))
    (result as unknown as unknown[]).length = value.length;
  return result;
}

function readPath(data: unknown, path: readonly string[]): unknown {
  let value = data;
  for (const key of path) {
    if (value === null || typeof value !== "object")
      throw new TypeError("Missing hydration field: " + path.join("."));
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor))
      throw new TypeError(
        "Hydration fields must be own data properties: " + path.join("."),
      );
    value = descriptor.value;
  }
  return value;
}
