import { addCleanup } from "../ownership/ownership.cleanup";
import { isShuttingDown } from "../ownership/ownership.meta";
import { getCurrentHookNode } from "./context";

/**
 * Registers a cleanup on the current ownership node. It runs once when that
 * component, branch or scope is disposed; cleanups run in reverse order.
 *
 * @remarks
 * **When to use:** to release something that already exists, such as an
 * unsubscribe function returned by an external API. Works in component bodies
 * and inside any active ownership scope, unlike `useUnmount`.
 * **When not to use:** to create and dispose a resource together; use
 * `useOwned`. Without an ownership node the cleanup is never called. On a
 * node that is already closing, for example from inside another cleanup, it
 * runs immediately.
 *
 * @param fn The cleanup to run on disposal.
 */
export function onCleanup(fn: () => void): void {
  const node = getCurrentHookNode();

  if (node === null) {
    if (__DEV__) {
      console.warn(
        "onCleanup() was called without an active owner; the cleanup will never run.",
      );
    }
    return;
  }

  if (isShuttingDown(node)) {
    fn();
    return;
  }

  addCleanup(node, fn);
}
