import {
  registerCleanup,
  runInOwnershipScope,
  runWithComponentHooks,
  useOwnedEffect,
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
  return runInOwnershipScope(context.owner, scope, () =>
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

export function useDOMOwnedEffect(
  fn: () => void | Cleanup,
  context: DOMExecutionContext = getActiveDOMExecutionContext(),
): Cleanup {
  return useOwnedEffect({ owner: context.owner }, () =>
    runWithDOMExecutionContext(context, fn),
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
