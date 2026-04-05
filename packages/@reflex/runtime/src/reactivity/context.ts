import type { ReactiveNode } from "./shape";
import { recordDebugEvent } from "../debug";

export interface EngineHooks {
  onEffectInvalidated?(node: ReactiveNode): void;
  onReactiveSettled?(): void;
}

export type CleanupRegistrar = (cleanup: () => void) => void;

type OnEffectInvalidatedHook = EngineHooks["onEffectInvalidated"];
type OnReactiveSettledHook = EngineHooks["onReactiveSettled"];

const EFFECT_INVALIDATED_HOOK = 1;
const REACTIVE_SETTLED_HOOK = 1 << 1;

function normalizeOwnHook<T extends keyof EngineHooks>(
  hooks: EngineHooks,
  key: T,
): EngineHooks[T] | undefined {
  if (!Object.hasOwn(hooks, key)) return undefined;

  const hook = hooks[key];
  return typeof hook === "function" ? hook : undefined;
}

/**
 * ExecutionContext управляет состоянием вычисления и уведомлениями host'у.
 *
 * Ключевые принципы:
 * - Контекст НЕ глобальный - это объект, передаваемый по параметрам
 * - Host полностью контролирует scheduling эффектов
 * - Контекст только отслеживает текущее состояние вычисления
 *
 * Поля:
 * - activeComputed: текущий узел в процессе вычисления (для trackRead)
 * - propagationDepth: глубина каскада инвалидаций
 * - cleanupRegistrar: функция для регистрации cleanup в эффектах
 */
export class ExecutionContext {
  activeComputed: ReactiveNode | null = null;
  propagationDepth = 0;
  cleanupRegistrar: CleanupRegistrar | null = null;
  readonly hooks: EngineHooks;
  onEffectInvalidatedHook: OnEffectInvalidatedHook = undefined;
  onReactiveSettledHook: OnReactiveSettledHook = undefined;
  private hookMask = 0;

  constructor(hooks: EngineHooks = {}) {
    this.hooks = {};
    // Keep the public hook snapshot and the hot-path caches synchronized.
    Object.defineProperties(this.hooks, {
      onEffectInvalidated: {
        enumerable: true,
        get: () => this.onEffectInvalidatedHook,
        set: (hook: OnEffectInvalidatedHook) => {
          this.setOnEffectInvalidatedHook(hook);
        },
      },
      onReactiveSettled: {
        enumerable: true,
        get: () => this.onReactiveSettledHook,
        set: (hook: OnReactiveSettledHook) => {
          this.setOnReactiveSettledHook(hook);
        },
      },
    });
    this.setHooks(hooks);
  }

  dispatchWatcherEvent(node: ReactiveNode): void {
    if (__DEV__) {
      recordDebugEvent(this, "watcher:invalidated", { node });
    }
    const hook = this.onEffectInvalidatedHook;
    if (hook !== undefined) {
      hook(node); // прямой вызов — монomorphic call site
    }
  }

  maybeNotifySettled(): void {
    if (!__DEV__ && (this.hookMask & REACTIVE_SETTLED_HOOK) === 0) return;
    if (this.propagationDepth !== 0 || this.activeComputed !== null) return;

    const hook = this.onReactiveSettledHook;

    if (__DEV__) {
      recordDebugEvent(this, "context:settled");
    }

    hook?.();
  }

  enterPropagation(): void {
    ++this.propagationDepth;

    if (__DEV__) {
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

    if (__DEV__) {
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

  setHooks(hooks: EngineHooks = {}): void {
    const onEffectInvalidated = normalizeOwnHook(hooks, "onEffectInvalidated");
    const onReactiveSettled = normalizeOwnHook(hooks, "onReactiveSettled");

    this.hooks.onEffectInvalidated = onEffectInvalidated;
    this.hooks.onReactiveSettled = onReactiveSettled;

    if (__DEV__) {
      recordDebugEvent(this, "context:hooks", {
        detail: {
          hasOnEffectInvalidated: this.onEffectInvalidatedHook !== undefined,
          hasOnReactiveSettled: this.onReactiveSettledHook !== undefined,
        },
      });
    }
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

  private setOnEffectInvalidatedHook(hook: OnEffectInvalidatedHook): void {
    this.onEffectInvalidatedHook =
      typeof hook === "function" ? hook : undefined;
    this.updateHookMask(
      EFFECT_INVALIDATED_HOOK,
      this.onEffectInvalidatedHook !== undefined,
    );
  }

  private setOnReactiveSettledHook(hook: OnReactiveSettledHook): void {
    this.onReactiveSettledHook = typeof hook === "function" ? hook : undefined;
    this.updateHookMask(
      REACTIVE_SETTLED_HOOK,
      this.onReactiveSettledHook !== undefined,
    );
  }

  private updateHookMask(bit: number, enabled: boolean): void {
    this.hookMask = enabled ? this.hookMask | bit : this.hookMask & ~bit;
  }
}

/**
 * Default execution context for single-threaded environments.
 *
 * Used as the default parameter in all API functions. When a new context
 * is created with createExecutionContext(), the global context should be
 * explicitly passed if needed. This prevents accidental state pollution
 * in multi-context scenarios.
 *
 */
let defaultContext = createExecutionContext({});

export function createExecutionContext(
  hooks: EngineHooks = {},
): ExecutionContext {
  return new ExecutionContext(hooks);
}

/**
 * Get the current default execution context.
 *
 * Note: When working with multiple contexts, explicitly pass the desired
 * context to API functions instead of relying on this default.
 */
export function getDefaultContext(): ExecutionContext {
  return defaultContext;
}

/**
 * Replace the default execution context and return the previous one.
 *
 * This allows for proper cleanup and testing of context switches.
 *
 * Example:
 * ```ts
 * const previousCtx = setDefaultContext(newContext);
 * // ... do something with newContext ...
 * setDefaultContext(previousCtx);  // restore
 * ```
 */
export function setDefaultContext(context: ExecutionContext): ExecutionContext {
  const previous = defaultContext;
  defaultContext = context;
  return previous;
}

/**
 * Reset the default context to a fresh instance.
 * Useful for testing.
 */
export function resetDefaultContext(hooks: EngineHooks = {}): ExecutionContext {
  const next = new ExecutionContext(hooks);
  defaultContext = next;
  return next;
}
