import type { OwnerContext, Scope } from "../ownership/ownership.scope";
import { getHookOwner } from "./owner";

export interface RenderEffectScheduler {
  schedule(task: () => void): () => void;
}

export const noopRenderEffectScheduler: RenderEffectScheduler = Object.freeze({
  schedule() {
    return () => {};
  },
});

interface ComponentHookContext {
  owner: OwnerContext;
  scope: Scope | null;
  renderEffectScheduler: RenderEffectScheduler | null;
}

interface ComponentHookOptions {
  owner?: OwnerContext;
  scope?: Scope | null;
  renderEffectScheduler?: RenderEffectScheduler | null;
}

let componentHookDepth = 0;
let currentHookContext: ComponentHookContext | null = null;
const warnedHooks = new Set<string>();

export function runWithComponentHooks<T>(fn: () => T): T;
export function runWithComponentHooks<T>(
  options: ComponentHookOptions,
  fn: () => T,
): T;
export function runWithComponentHooks<T>(
  optionsOrFn: ComponentHookOptions | (() => T),
  maybeFn?: () => T,
): T {
  const fn =
    typeof optionsOrFn === "function"
      ? optionsOrFn
      : maybeFn;

  if (fn === undefined) {
    throw new TypeError("runWithComponentHooks requires a callback");
  }

  const options =
    typeof optionsOrFn === "function"
      ? undefined
      : optionsOrFn;
  const owner = options?.owner ?? getHookOwner();
  const previousHookContext = currentHookContext;

  currentHookContext = {
    owner,
    scope: options?.scope ?? owner.currentOwner,
  renderEffectScheduler:
    options?.renderEffectScheduler ?? noopRenderEffectScheduler,
  };
  componentHookDepth++;

  try {
    return fn();
  } finally {
    componentHookDepth--;
    currentHookContext = previousHookContext;
  }
}

export function assertHookUsage(hookName: string): void {
  if (!__DEV__ || componentHookDepth > 0 || warnedHooks.has(hookName)) return;

  warnedHooks.add(hookName);
  console.warn(
    `${hookName}() should only be used while rendering a Reflex component.`,
  );
}

export function getCurrentHookOwner(): OwnerContext {
  return currentHookContext?.owner ?? getHookOwner();
}

export function getCurrentHookScope(): Scope | null {
  const owner = getCurrentHookOwner();
  return currentHookContext?.scope ?? owner.currentOwner;
}

export function isInsideComponentHooks(): boolean {
  return componentHookDepth > 0;
}

export function getCurrentRenderEffectScheduler(): RenderEffectScheduler {
  return currentHookContext?.renderEffectScheduler ?? noopRenderEffectScheduler;
}
