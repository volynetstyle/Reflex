import {
  getActiveOwnerContext,
  runWithOwner,
  type OwnerContext,
  type OwnerHookState,
} from "../ownership/ownership.scope";
import type { OwnershipNode } from "../ownership/ownership.node";
import { getHookOwner } from "./owner";

interface ComponentExecutionContext {
  owner: OwnerContext;
  node: OwnershipNode | null;
}

interface ComponentExecutionOptions {
  owner?: OwnerContext;
  node?: OwnershipNode | null;
}

function getCurrentHookState(): OwnerHookState {
  return (getActiveOwnerContext() ?? getHookOwner()).hookState;
}

function getCurrentComponentContext(): ComponentExecutionContext | null {
  return getCurrentHookState()
    .currentComponentContext as ComponentExecutionContext | null;
}

function resolveComponentOwner(
  options: ComponentExecutionOptions | undefined,
): OwnerContext {
  return options?.owner ?? getActiveOwnerContext() ?? getHookOwner();
}

function resolveComponentNode(
  options: ComponentExecutionOptions | undefined,
  owner: OwnerContext,
): OwnershipNode | null {
  return options && "node" in options ? options.node ?? null : owner.currentNode;
}

export function runWithComponentExecution<T>(fn: () => T): T;

export function runWithComponentExecution<T>(
  options: ComponentExecutionOptions,
  fn: () => T,
): T;

export function runWithComponentExecution<T>(
  optionsOrFn: ComponentExecutionOptions | (() => T),
  maybeFn?: () => T,
): T {
  const hasOptions = typeof optionsOrFn !== "function";
  const options = hasOptions ? optionsOrFn : undefined;
  const fn = hasOptions ? maybeFn : optionsOrFn;

  if (fn === undefined) {
    throw new TypeError("runWithComponentExecution requires a callback");
  }

  const owner = resolveComponentOwner(options);
  const node = resolveComponentNode(options, owner);
  const hookState = owner.hookState;

  const previousComponentContext = hookState.currentComponentContext;
  const previousExecutionDepth = hookState.componentExecutionDepth;

  return runWithOwner(owner, node, () => {
    hookState.currentComponentContext = {
      owner,
      node,
    };

    hookState.componentExecutionDepth = previousExecutionDepth + 1;

    try {
      return fn();
    } finally {
      hookState.componentExecutionDepth = previousExecutionDepth;
      hookState.currentComponentContext = previousComponentContext;
    }
  });
}

export function assertHookUsage(hookName: string): void {
  if (!__DEV__) return;

  const hookState = getCurrentHookState();

  if (
    hookState.componentExecutionDepth > 0 ||
    hookState.warnedHooks.has(hookName)
  ) {
    return;
  }

  hookState.warnedHooks.add(hookName);

  console.warn(
    `${hookName}() should only be used while executing a Reflex component.`,
  );
}

export function getCurrentHookOwner(): OwnerContext {
  return (
    getCurrentComponentContext()?.owner ??
    getActiveOwnerContext() ??
    getHookOwner()
  );
}

export function getCurrentHookNode(): OwnershipNode | null {
  const context = getCurrentComponentContext();

  if (context !== null) {
    return context.node;
  }

  return getCurrentHookOwner().currentNode;
}

export function isInsideComponentExecution(): boolean {
  return getCurrentHookState().componentExecutionDepth > 0;
}