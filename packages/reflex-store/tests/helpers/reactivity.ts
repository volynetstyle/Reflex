export {
  createRuntime,
  effect,
} from "../../examples/task-board/src/reactivity";
export { createDisposableComputed } from "../../src/store/computed";
import { createDisposableComputed } from "../../src/store/computed";
import { createStoreCell } from "../../src/store/cell";

export function signal<T>(initial: T) {
  const cell = createStoreCell(initial);
  return Object.assign(() => cell(), {
    set(value: T | ((previous: T) => T)) {
      const next =
        typeof value === "function"
          ? (value as (previous: T) => T)(cell.peek())
          : value;
      cell.set(next);
      return next;
    },
  });
}

export function computed<T>(callback: () => T) {
  const value = createDisposableComputed(callback);
  return Object.defineProperty(value.read, "value", { get: value.read });
}
