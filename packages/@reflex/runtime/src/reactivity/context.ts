import type { ReactiveNode } from "./shape";
import { recordDebugEvent } from "../debug";

export interface EngineHooks {
  onEffectInvalidated?(node: ReactiveNode): void;
  onReactiveSettled?(): void;
}

export type CleanupRegistrar = (cleanup: () => void) => void;

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

  constructor(hooks: EngineHooks = {}) {
    this.hooks = {};
    this.setHooks(hooks);
  }

  dispatchWatcherEvent(node: ReactiveNode): void {
    if (__DEV__) {
      recordDebugEvent(this, "watcher:invalidated", {
        node,
      });
    }

    this.hooks.onEffectInvalidated?.(node);
  }

  maybeNotifySettled(): void {
    if (this.propagationDepth === 0 && this.activeComputed === null) {
      if (__DEV__) {
        recordDebugEvent(this, "context:settled");
      }

      this.hooks.onReactiveSettled?.();
    }
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
    const onEffectInvalidated = Object.hasOwn(hooks, "onEffectInvalidated")
      ? hooks.onEffectInvalidated
      : undefined;
    const onReactiveSettled = Object.hasOwn(hooks, "onReactiveSettled")
      ? hooks.onReactiveSettled
      : undefined;

    if (typeof onEffectInvalidated === "function") {
      this.hooks.onEffectInvalidated = onEffectInvalidated;
    } else {
      delete this.hooks.onEffectInvalidated;
    }

    if (typeof onReactiveSettled === "function") {
      this.hooks.onReactiveSettled = onReactiveSettled;
    } else {
      delete this.hooks.onReactiveSettled;
    }

    if (__DEV__) {
      recordDebugEvent(this, "context:hooks", {
        detail: {
          hasOnEffectInvalidated:
            typeof this.hooks.onEffectInvalidated === "function",
          hasOnReactiveSettled:
            typeof this.hooks.onReactiveSettled === "function",
        },
      });
    }
  }

  registerEffectCleanup(cleanup: () => void): void {
    this.cleanupRegistrar?.(cleanup);
  }

  withCleanupRegistrar<T>(
    registrar: CleanupRegistrar | null,
    fn: () => T,
  ): T {
    const previousRegistrar = this.cleanupRegistrar;
    this.cleanupRegistrar = registrar;

    try {
      return fn();
    } finally {
      this.cleanupRegistrar = previousRegistrar;
    }
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
let defaultContext = createExecutionContext(undefined);

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
export function setDefaultContext(
  context: ExecutionContext,
): ExecutionContext {
  const previous = defaultContext;
  defaultContext = context;
  return previous;
}

/**
 * Reset the default context to a fresh instance.
 * Useful for testing.
 */
export function resetDefaultContext(
  hooks: EngineHooks = {},
): ExecutionContext {
  const next = new ExecutionContext(hooks);
  defaultContext = next;
  return next;
}
