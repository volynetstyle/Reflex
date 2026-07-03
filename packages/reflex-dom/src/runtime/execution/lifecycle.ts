import {
  createOwnedEffect,
  registerCleanup,
  runWithOwnershipNode,
  runWithComponentHooks,
  type Scope,
} from "@volynets/reflex-framework";
import {
  getActiveDOMExecutionContext,
  runWithDOMExecutionContext,
} from "./state";
import type { DOMExecutionContext } from "./types";
import type { Cleanup } from "../../types";

export function runInDOMOwnershipScope<T>(
  scope: Scope,
  fn: () => T,
  context: DOMExecutionContext = getActiveDOMExecutionContext(),
): T {
  return runWithOwnershipNode(context.owner, scope, () =>
    runWithDOMExecutionContext(context, fn),
  );
}

export function runWithDOMComponentHooks<T>(
  fn: () => T,
  context: DOMExecutionContext = getActiveDOMExecutionContext(),
): T {
  return runWithComponentHooks(
    {
      owner: context.owner,
      scope: context.owner.currentOwner,
      renderEffectScheduler: context.renderEffectScheduler,
    },
    () => runWithDOMExecutionContext(context, fn),
  );
}

export function createDOMOwnedEffect(
  fn: () => void | Cleanup,
  context: DOMExecutionContext = getActiveDOMExecutionContext(),
): Cleanup {
  return createOwnedEffect(context.owner, context.owner.currentOwner, () =>
    runWithDOMExecutionContext(context, fn),
  );
}

export function createDOMOwnedReaction<T>(
  read: () => T,
  react: (value: T) => void | Cleanup,
  context: DOMExecutionContext = getActiveDOMExecutionContext(),
): Cleanup {
  let initialized = false;

  return createDOMOwnedEffect(() => {
    const value = read();

    if (!initialized) {
      initialized = true;
      return;
    }

    return react(value);
  }, context);
}

export function registerDOMCleanup(
  fn: () => void,
  context: DOMExecutionContext = getActiveDOMExecutionContext(),
): void {
  registerCleanup(context.owner, () => {
    runWithDOMExecutionContext(context, fn);
  });
}
