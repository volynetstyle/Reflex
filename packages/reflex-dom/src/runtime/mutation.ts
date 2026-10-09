import type { DOMContext } from "./context";

/** Enter the captured runtime for a mutation without adding a batch boundary. */
export function bindDOMWrite<Args extends unknown[], Result>(
  context: DOMContext,
  write: (...args: Args) => Result,
): (...args: Args) => Result {
  return (...args) => context.runtime.run(() => write(...args));
}
