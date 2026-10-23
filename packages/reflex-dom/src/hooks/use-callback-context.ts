import { bindManaged, isShuttingDown } from "@volynets/reflex-framework";
import {
  captureDOMCallbackScope,
  getActiveDOMContext,
  runInDOMCallbackScope,
} from "../runtime/context";

/**
 * Binds `fn` to the current component: each call enters its renderer, runtime
 * batch and ownership node, so hooks such as `useOwned` and `onCleanup` attach
 * to the component and close with it. After the component or application is
 * disposed, calls are ignored and return `undefined`.
 *
 * @remarks
 * **When to use:** for callbacks that run later from outside the renderer:
 * timers, observers, third-party listeners and continuations after `await`.
 * Bind during setup and call the result later; DOM event props are already
 * bound this way.
 * **When not to use:** to wrap an entire async function; context does not
 * cross `await`. Bind each continuation instead.
 *
 * @param fn The callback to run inside the captured scope.
 */
export function useCallbackContext<A extends unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => R | undefined {
  const context = getActiveDOMContext();
  if (context === null) return bindManaged(fn);

  const scope = captureDOMCallbackScope(context);
  const node = scope.node;
  const domain = context.runtime.domain;

  return (...args: A): R | undefined => {
    if (domain.closed || (node !== null && isShuttingDown(node))) {
      return undefined;
    }
    return runInDOMCallbackScope(scope, () => fn(...args));
  };
}
