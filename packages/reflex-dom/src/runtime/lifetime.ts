import {
  createOwnedEffect,
  registerCleanup,
  runWithOwnershipNode,
  type OwnershipNode,
} from "@volynets/reflex-framework";
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

export function createDOMOwnedReaction<T>(
  read: () => T,
  react: (value: T) => void | Cleanup,
  context: DOMContext = getDOMContext(),
): Cleanup {
  let initialized = false;

  return createOwnedEffect(context.owner, context.owner.currentNode, () =>
    withDOMContext(context, () => {
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
  context: DOMContext = getDOMContext(),
): void {
  registerCleanup(context.owner, () => {
    withDOMContext(context, fn);
  });
}
