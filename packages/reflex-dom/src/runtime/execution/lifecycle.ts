import {
  createOwnedEffect,
  registerCleanup,
  runWithOwnershipNode,
  type OwnershipNode,
} from "@volynets/reflex-framework";
import {
  getActiveDOMExecutionContext,
  runWithDOMExecutionContext,
} from "./state";
import type { DOMExecutionContext } from "./types";
import type { Cleanup } from "../../types";

export function runInDOMOwnershipNode<T>(
  node: OwnershipNode,
  fn: () => T,
  context: DOMExecutionContext = getActiveDOMExecutionContext(),
): T {
  return runWithOwnershipNode(context.owner, node, () =>
    runWithDOMExecutionContext(context, fn),
  );
}

export function createDOMOwnedReaction<T>(
  read: () => T,
  react: (value: T) => void | Cleanup,
  context: DOMExecutionContext = getActiveDOMExecutionContext(),
): Cleanup {
  let initialized = false;

  return createOwnedEffect(context.owner, context.owner.currentNode, () =>
    runWithDOMExecutionContext(context, () => {
      const value = read();

      if (!initialized) {
        initialized = true;
        return;
      }

      return react(value);
    }),
  );
}

export function registerDOMCleanup(
  fn: () => void,
  context: DOMExecutionContext = getActiveDOMExecutionContext(),
): void {
  registerCleanup(context.owner, () => {
    runWithDOMExecutionContext(context, fn);
  });
}
