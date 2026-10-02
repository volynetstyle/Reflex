import { getLifetimeSignal } from "../ownership/ownership.signal";
import { getCurrentHookNode } from "./context";

/** Return the current owner's signal. Capture it before crossing an async boundary. */
export function useAbortSignal(): AbortSignal {
  const node = getCurrentHookNode();
  if (node === null) {
    throw new Error("useAbortSignal requires an active ownership node.");
  }
  return getLifetimeSignal(node);
}
