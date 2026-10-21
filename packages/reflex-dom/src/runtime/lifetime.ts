import {
  createOwnedEffect,
  registerCleanup,
  runWithOwnershipNode,
  type OwnershipNode,
} from "@volynets/reflex-framework";
import { untracked } from "@volynets/reflex-runtime";
import { getDOMContext, withDOMContext } from "./context";
import type { DOMContext } from "./context";
import type { Cleanup } from "../types";

export function runInDOMOwnershipNode<T>(
  node: OwnershipNode,
  fn: () => T,
  context: DOMContext = getDOMContext(),
): T {
  return runWithOwnershipNode(context.owner, node, () =>
    withDOMContext(context, fn),
  );
}

/**
 * Tracks `read` and calls `react` with each later value (the first value is
 * only tracked; the caller has already applied it).
 *
 * `react` runs untracked: it mounts and binds content whose own reads belong
 * to their own computations. Tracking them here would subscribe this reaction
 * to every binding it creates and re-run it, remounting its content, whenever
 * any of them changed.
 */
export function createDOMOwnedReaction<T>(
  read: () => T,
  react: (value: T) => void | Cleanup,
  context: DOMContext = getDOMContext(),
): Cleanup {
  let initialized = false;
  let pending: T;
  const reactPending = () => react(pending);

  return createOwnedEffect(context.owner, context.owner.currentNode, () =>
    withDOMContext(context, () => {
      const value = read();

      if (!initialized) {
        initialized = true;
        return;
      }

      pending = value;
      return untracked(reactPending);
    }),
  );
}

/**
 * Tracks `read` and applies every value, including the first, in one
 * computation: the value is read once at bind time instead of once to apply
 * and once to track. `apply` runs untracked.
 */
export function createDOMOwnedBinding<T>(
  read: () => T,
  apply: (value: T) => void,
  context: DOMContext = getDOMContext(),
): void {
  // Allocated once per binding rather than once per run.
  let pending: T;
  const applyPending = () => apply(pending);
  const applyInContext = () => withDOMContext(context, applyPending);

  createOwnedEffect(context.owner, context.owner.currentNode, () => {
    pending = withDOMContext(context, read);
    untracked(applyInContext);
  });
}

export function registerDOMCleanup(
  fn: () => void,
  context: DOMContext = getDOMContext(),
): void {
  registerCleanup(context.owner, () => {
    withDOMContext(context, fn);
  });
}
