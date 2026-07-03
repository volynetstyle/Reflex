import {
  getActiveOwnerContext,
  runWithOwner,
  type OwnerContext,
  type OwnerHookState,
  type Scope,
} from "../ownership/ownership.scope";
import { getHookOwner } from "./owner";

export interface RenderEffectScheduler {
  schedule(task: () => void, phase?: RenderEffectPhase): () => void;
}

export type RenderEffectPhase =
  (typeof RenderEffectPhase)[keyof typeof RenderEffectPhase];

export const RenderEffectPhase = {
  before: 1 << 0,
  render: 1 << 1,
  after: 1 << 2,
  BeforeRender: 1 << 0,
  Render: 1 << 1,
  AfterRender: 1 << 2,
} as const;

export const noopRenderEffectScheduler: RenderEffectScheduler = Object.freeze({
  schedule() {
    return () => {};
  },
});

interface ComponentHookContext {
  hookIndex: number;
  owner: OwnerContext;
  scope: Scope | null;
  renderEffectScheduler: RenderEffectScheduler | null;
}

interface ComponentHookOptions {
  owner?: OwnerContext;
  scope?: Scope | null;
  renderEffectScheduler?: RenderEffectScheduler | null;
}

function getCurrentHookState(): OwnerHookState {
  return (getActiveOwnerContext() ?? getHookOwner()).hookState;
}

function getCurrentHookContext(): ComponentHookContext | null {
  return getCurrentHookState()
    .currentHookContext as ComponentHookContext | null;
}

export function runWithComponentHooks<T>(fn: () => T): T;
export function runWithComponentHooks<T>(
  options: ComponentHookOptions,
  fn: () => T,
): T;
export function runWithComponentHooks<T>(
  optionsOrFn: ComponentHookOptions | (() => T),
  maybeFn?: () => T,
): T {
  const fn = typeof optionsOrFn === "function" ? optionsOrFn : maybeFn;

  if (fn === undefined) {
    throw new TypeError("runWithComponentHooks requires a callback");
  }

  const options = typeof optionsOrFn === "function" ? undefined : optionsOrFn;
  const owner = options?.owner ?? getActiveOwnerContext() ?? getHookOwner();
  const scope = options?.scope ?? owner.currentOwner;
  const hookState = owner.hookState;
  const previousHookContext = hookState.currentHookContext;

  return runWithOwner(owner, scope, () => {
    hookState.currentHookContext = {
      hookIndex: 0,
      owner,
      scope,
      renderEffectScheduler:
        options?.renderEffectScheduler ?? noopRenderEffectScheduler,
    };
    hookState.componentHookDepth++;

    try {
      return fn();
    } finally {
      hookState.componentHookDepth--;
      hookState.currentHookContext = previousHookContext;
    }
  });
}

export function assertHookUsage(hookName: string): void {
  if (!__DEV__) return;

  const hookState = getCurrentHookState();

  if (hookState.componentHookDepth > 0 || hookState.warnedHooks.has(hookName)) {
    return;
  }

  hookState.warnedHooks.add(hookName);
  console.warn(
    `${hookName}() should only be used while rendering a Reflex component.`,
  );
}

export function getCurrentHookOwner(): OwnerContext {
  return (
    getCurrentHookContext()?.owner ?? getActiveOwnerContext() ?? getHookOwner()
  );
}

export function getCurrentHookScope(): Scope | null {
  const owner = getCurrentHookOwner();
  return getCurrentHookContext()?.scope ?? owner.currentOwner;
}

export function isInsideComponentHooks(): boolean {
  return getCurrentHookState().componentHookDepth > 0;
}

export function getCurrentRenderEffectScheduler(): RenderEffectScheduler {
  return (
    getCurrentHookContext()?.renderEffectScheduler ?? noopRenderEffectScheduler
  );
}

export function consumeHookSlot(): number {
  assertHookUsage("hook");

  const currentHookContext = getCurrentHookContext();
  if (currentHookContext === null) return 0;

  return currentHookContext.hookIndex++;
}
