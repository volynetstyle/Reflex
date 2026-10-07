import { transaction } from "./collections";
import {
  depthOf,
  getStoreControl,
  isPlain,
  type Snapshot,
  type StoreControl,
} from "./values";
import { untracked } from "@volynets/reflex-runtime/internal";
import type { CompiledStore, StoreShape, StoreData } from "./store/createStore";

type HydrationBranch = { path: readonly string[]; keys: ReadonlySet<string> };
const hydrationShapes = new WeakMap<StoreControl, readonly HydrationBranch[]>();

function hydrationShape(control: StoreControl): readonly HydrationBranch[] {
  const cached = hydrationShapes.get(control);
  if (cached) return cached;
  const branches = control.branches!.map((path) => ({
    path,
    keys: new Set<string>(),
  }));
  const parents = new Map(
    branches.map((branch) => [JSON.stringify(branch.path), branch]),
  );
  for (const candidates of [control.paths!, control.branches!]) {
    for (const path of candidates) {
      if (path.length === 0) continue;
      parents
        .get(JSON.stringify(path.slice(0, -1)))
        ?.keys.add(path[path.length - 1]!);
    }
  }
  hydrationShapes.set(control, branches);
  return branches;
}

/** Restore all compiled data fields after validating the complete static schema. */
export function hydrate<T extends StoreShape>(
  store: CompiledStore<T>,
  data: Snapshot<StoreData<T>>,
): void {
  const control = getStoreControl(store);
  if (!control?.hydrate || !control.paths || !control.branches)
    throw new TypeError("hydrate() requires a compiled store");
  untracked(() => {
    for (const { path, keys } of hydrationShape(control)) {
      const branch = readPath(data, path);
      if (!isPlain(branch) || Array.isArray(branch))
        throw new TypeError("Invalid hydration branch: " + path.join("."));
      const actual = Reflect.ownKeys(branch);
      if (actual.length !== keys.size)
        throw new TypeError(
          "Hydration data does not match the compiled store shape",
        );
      for (const key of actual)
        if (typeof key !== "string" || !keys.has(key))
          throw new TypeError(
            "Hydration data does not match the compiled store shape",
          );
    }
    const seen = new Map<object, unknown>();
    const paths = control.paths!;
    const ordered = new Array<unknown>(paths.length);
    for (let i = 0; i < paths.length; i++)
      ordered[i] = restoreValue(readPath(data, paths[i]!), seen);
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
  const cached = seen.get(value);
  if (cached !== undefined) return cached;
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
  const array = Array.isArray(value);
  const result = (
    array ? [] : Object.create(Object.getPrototypeOf(value))
  ) as Record<PropertyKey, unknown>;
  seen.set(value, result);
  const output = {
    configurable: true,
    writable: true,
    enumerable: true,
    value: undefined as unknown,
  };
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor))
      throw new TypeError("Hydration values must contain data properties");
    output.enumerable = descriptor.enumerable!;
    output.value = restoreValue(descriptor.value, seen);
    Object.defineProperty(result, key, output);
  }
  if (array) (result as unknown as unknown[]).length = value.length;
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
