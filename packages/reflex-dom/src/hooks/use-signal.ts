import {
  useSignal as useFrameworkSignal,
  type SetInput,
  type SignalAccessor,
} from "@volynets/reflex-framework";
import { getActiveRuntimeContext } from "@volynets/reflex-runtime";
import { currentConsumer } from "@volynets/reflex-runtime/internal";
import { getActiveDOMContext } from "../runtime/context";
import { bindDOMWrite } from "../runtime/mutation";

/**
 * Creates a signal whose writes enter the DOM runtime that created it.
 * External callbacks can write directly; delivery follows the runtime's
 * effect strategy. Reactive reads must stay in that runtime because each
 * runtime owns its own scheduler. Use renderer.batch() for a transaction.
 */
export function useSignal<T>(initial: T): SignalAccessor<T> {
  const context = getActiveDOMContext();
  const signal = useFrameworkSignal(initial);

  if (context === null) return signal;
  const ownerContext = context;

  const write = bindDOMWrite(ownerContext, (input: SetInput<T>) =>
    signal(input),
  );

  function bound(): T;
  function bound(input: SetInput<T>): T;
  function bound(input?: SetInput<T>): T {
    if (arguments.length === 0) {
      const activeRuntime = getActiveRuntimeContext();
      if (
        activeRuntime !== ownerContext.runtime.execution &&
        currentConsumer !== null
      ) {
        throw new Error(
          "A DOM signal cannot be read by a reactive computation in another runtime.",
        );
      }
      return signal();
    }
    return write(input as SetInput<T>);
  }

  return bound as SignalAccessor<T>;
}
