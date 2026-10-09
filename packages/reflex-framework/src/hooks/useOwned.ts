import { addCleanup } from "../ownership/ownership.cleanup";
import { getCurrentHookNode } from "./context";

/**
 * Creates a resource and binds its disposer to the current ownership node.
 *
 * @remarks
 * **When to use:** for timers, subscriptions, API objects, and other resources
 * that need cleanup when a component or branch closes.
 * **When not to use:** for reactive synchronization; use `useEffect`. Without
 * an ownership context, the resource is returned without automatic disposal.
 *
 * @param create Creates the resource.
 * @param dispose Disposes the created resource.
 * @typeParam T The resource type.
 */
export function useOwned<T>(create: () => T, dispose: (value: T) => void): T {
  const node = getCurrentHookNode();
  const value = create();

  if (node === null) {
    return value;
  }

  addCleanup(node, () => dispose(value));
  return value;
}
