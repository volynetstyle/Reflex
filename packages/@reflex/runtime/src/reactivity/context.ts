import type { ReactiveNode } from "./shape";
import { recordDebugEvent } from "../debug";

export interface EngineHooks {
  onEffectInvalidated?(node: ReactiveNode): void;
  onReactiveSettled?(): void;
}

export type CleanupRegistrar = (cleanup: () => void) => void;

type OnEffectInvalidatedHook = EngineHooks["onEffectInvalidated"];
type OnReactiveSettledHook = EngineHooks["onReactiveSettled"];

const EMPTY_HOOKS = Object.freeze({}) as Readonly<EngineHooks>;
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;
const HOOK_VIEW_OWNER = Symbol("ExecutionContext.hookViewOwner");
const SET_PUBLIC_EFFECT_INVALIDATED = Symbol(
  "ExecutionContext.setPublicEffectInvalidated",
);
const SET_PUBLIC_REACTIVE_SETTLED = Symbol(
  "ExecutionContext.setPublicReactiveSettled",
);

type HookOwner = ExecutionContext & {
  [SET_PUBLIC_EFFECT_INVALIDATED](hook: OnEffectInvalidatedHook): void;
  [SET_PUBLIC_REACTIVE_SETTLED](hook: OnReactiveSettledHook): void;
};

type HookView = EngineHooks & {
  [HOOK_VIEW_OWNER]: HookOwner;
};

function normalizeOwnHook<T extends keyof EngineHooks>(
  hooks: EngineHooks,
  key: T,
): EngineHooks[T] | undefined {
  if (!Object.hasOwn(hooks, key)) return undefined;

  const hook = hooks[key];
  return typeof hook === "function" ? hook : undefined;
}

function composeEffectInvalidatedDispatch(
  runtimeHook: OnEffectInvalidatedHook,
  hook: OnEffectInvalidatedHook,
): OnEffectInvalidatedHook {
  if (runtimeHook === undefined) return hook;
  if (hook === undefined) return runtimeHook;

  return function (node) {
    runtimeHook(node);
    hook(node);
  };
}

function composeSettledDispatch(
  runtimeHook: OnReactiveSettledHook,
  hook: OnReactiveSettledHook,
): OnReactiveSettledHook {
  if (runtimeHook === undefined) return hook;
  if (hook === undefined) return runtimeHook;

  return () => {
    runtimeHook();
    hook();
  };
}

function getEffectInvalidatedHook(this: HookView): OnEffectInvalidatedHook {
  return this[HOOK_VIEW_OWNER].onEffectInvalidatedHook;
}

function setEffectInvalidatedHook(
  this: HookView,
  hook: OnEffectInvalidatedHook,
): void {
  this[HOOK_VIEW_OWNER][SET_PUBLIC_EFFECT_INVALIDATED](hook);
}

function getReactiveSettledHook(this: HookView): OnReactiveSettledHook {
  return this[HOOK_VIEW_OWNER].onReactiveSettledHook;
}

function setReactiveSettledHook(
  this: HookView,
  hook: OnReactiveSettledHook,
): void {
  this[HOOK_VIEW_OWNER][SET_PUBLIC_REACTIVE_SETTLED](hook);
}

const HOOK_VIEW_DESCRIPTORS: PropertyDescriptorMap = {
  onEffectInvalidated: {
    enumerable: true,
    get: getEffectInvalidatedHook,
    set: setEffectInvalidatedHook,
  },
  onReactiveSettled: {
    enumerable: true,
    get: getReactiveSettledHook,
    set: setReactiveSettledHook,
  },
};

function createHookView(owner: HookOwner): EngineHooks {
  const hooks = Object.create(
    Object.prototype,
    HOOK_VIEW_DESCRIPTORS,
  ) as HookView;
  Object.defineProperty(hooks, HOOK_VIEW_OWNER, {
    value: owner,
  });
  return hooks;
}

export class ExecutionContext {
  activeComputed: ReactiveNode | null = null;
  propagationDepth = 0;
  cleanupRegistrar: CleanupRegistrar | null = null;
  readonly hooks: EngineHooks;
  onEffectInvalidatedHook: OnEffectInvalidatedHook = undefined;
  onReactiveSettledHook: OnReactiveSettledHook = undefined;
  runtimeOnEffectInvalidatedHook: OnEffectInvalidatedHook = undefined;
  runtimeOnReactiveSettledHook: OnReactiveSettledHook = undefined;
  effectInvalidatedDispatch: OnEffectInvalidatedHook = undefined;
  settledDispatch: OnReactiveSettledHook = undefined;

  constructor(hooks: EngineHooks = EMPTY_HOOKS) {
    this.hooks = createHookView(this as HookOwner);
    this.setHooks(hooks);
  }

  dispatchWatcherEvent(node: ReactiveNode): void {
    const dispatch = this.effectInvalidatedDispatch;
    if (!IS_DEV && dispatch === undefined) return;

    if (IS_DEV) {
      recordDebugEvent(this, "watcher:invalidated", { node });
    }

    if (dispatch !== undefined) dispatch(node);
  }

  maybeNotifySettled(): void {
    const dispatch = this.settledDispatch;
    if (!IS_DEV && dispatch === undefined) return;
    if (this.propagationDepth !== 0 || this.activeComputed !== null) return;

    if (IS_DEV) {
      recordDebugEvent(this, "context:settled");
    }

    if (dispatch !== undefined) dispatch();
  }

  enterPropagation(): void {
    ++this.propagationDepth;

    if (IS_DEV) {
      recordDebugEvent(this, "context:enter-propagation", {
        detail: {
          depth: this.propagationDepth,
        },
      });
    }
  }

  leavePropagation(): void {
    if (this.propagationDepth > 0) {
      --this.propagationDepth;
    }

    if (IS_DEV) {
      recordDebugEvent(this, "context:leave-propagation", {
        detail: {
          depth: this.propagationDepth,
        },
      });
    }

    this.maybeNotifySettled();
  }

  resetState(): void {
    this.activeComputed = null;
    this.propagationDepth = 0;
    this.cleanupRegistrar = null;
  }

  setHooks(hooks: EngineHooks = EMPTY_HOOKS): void {
    this[SET_PUBLIC_EFFECT_INVALIDATED](
      normalizeOwnHook(hooks, "onEffectInvalidated"),
    );
    this[SET_PUBLIC_REACTIVE_SETTLED](
      normalizeOwnHook(hooks, "onReactiveSettled"),
    );
    this.recordHookSnapshot();
  }

  setRuntimeHooks(
    onEffectInvalidated: OnEffectInvalidatedHook = undefined,
    onReactiveSettled: OnReactiveSettledHook = undefined,
  ): void {
    this.runtimeOnEffectInvalidatedHook =
      typeof onEffectInvalidated === "function"
        ? onEffectInvalidated
        : undefined;
    this.runtimeOnReactiveSettledHook =
      typeof onReactiveSettled === "function" ? onReactiveSettled : undefined;
    this.refreshEffectInvalidatedDispatch();
    this.refreshSettledDispatch();
    this.recordHookSnapshot();
  }

  registerWatcherCleanup(cleanup: () => void): void {
    this.cleanupRegistrar?.(cleanup);
  }

  withCleanupRegistrar<T>(registrar: CleanupRegistrar | null, fn: () => T): T {
    const previousRegistrar = this.cleanupRegistrar;
    this.cleanupRegistrar = registrar;

    try {
      return fn();
    } finally {
      this.cleanupRegistrar = previousRegistrar;
    }
  }

  [SET_PUBLIC_EFFECT_INVALIDATED](hook: OnEffectInvalidatedHook): void {
    this.onEffectInvalidatedHook =
      typeof hook === "function" ? hook : undefined;
    this.refreshEffectInvalidatedDispatch();
  }

  [SET_PUBLIC_REACTIVE_SETTLED](hook: OnReactiveSettledHook): void {
    this.onReactiveSettledHook = typeof hook === "function" ? hook : undefined;
    this.refreshSettledDispatch();
  }

  private refreshEffectInvalidatedDispatch(): void {
    this.effectInvalidatedDispatch = composeEffectInvalidatedDispatch(
      this.runtimeOnEffectInvalidatedHook,
      this.onEffectInvalidatedHook,
    );
  }

  private refreshSettledDispatch(): void {
    this.settledDispatch = composeSettledDispatch(
      this.runtimeOnReactiveSettledHook,
      this.onReactiveSettledHook,
    );
  }

  private recordHookSnapshot(): void {
    if (!IS_DEV) return;

    recordDebugEvent(this, "context:hooks", {
      detail: {
        hasOnEffectInvalidated: this.effectInvalidatedDispatch !== undefined,
        hasOnReactiveSettled: this.settledDispatch !== undefined,
      },
    });
  }
}

export let defaultContext = createExecutionContext(EMPTY_HOOKS);

export function createExecutionContext(
  hooks: EngineHooks = EMPTY_HOOKS,
): ExecutionContext {
  return new ExecutionContext(hooks);
}

export function getDefaultContext(): ExecutionContext {
  return defaultContext;
}

export function setDefaultContext(context: ExecutionContext): ExecutionContext {
  const previous = defaultContext;
  defaultContext = context;
  return previous;
}

export function resetDefaultContext(
  hooks: EngineHooks = EMPTY_HOOKS,
): ExecutionContext {
  const next = new ExecutionContext(hooks);
  defaultContext = next;
  return next;
}
