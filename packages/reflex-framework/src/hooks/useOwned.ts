import { addCleanup } from "../ownership/ownership.cleanup";
import { getCurrentHookNode } from "./context";

export function useOwned<T>(
  create: () => T,
  dispose: (value: T) => void,
): T {
  const node = getCurrentHookNode();
  const value = create();

  if (node === null) {
    return value;
  }

  addCleanup(node, () => dispose(value));
  return value;
}