import type { ReactiveNode } from "./shape";

export interface EngineHooks {
  onEffectInvalidated?(node: ReactiveNode): void;
  onReactiveSettled?(): void;
}

export type CleanupRegistrar = (cleanup: () => void) => void;

class EngineContext {
  activeComputed: ReactiveNode | null = null;
  propagationDepth = 0;
  cleanupRegistrar: CleanupRegistrar | null = null;
  readonly hooks: EngineHooks;

  constructor(hooks: EngineHooks = {}) {
    this.hooks = hooks;
  }

  dispatchWatcherEvent(node: ReactiveNode): void {
    this.hooks.onEffectInvalidated?.(node);
  }

  maybeNotifySettled(): void {
    if (this.propagationDepth === 0 && this.activeComputed === null) {
      this.hooks.onReactiveSettled?.();
    }
  }

  enterPropagation(): void {
    ++this.propagationDepth;
  }

  leavePropagation(): void {
    if (this.propagationDepth > 0) {
      --this.propagationDepth;
    }

    this.maybeNotifySettled();
  }

  resetState(): void {
    this.activeComputed = null;
    this.propagationDepth = 0;
    this.cleanupRegistrar = null;
  }

  setHooks(hooks: EngineHooks = {}): void {
    delete this.hooks.onEffectInvalidated;
    delete this.hooks.onReactiveSettled;
    Object.assign(this.hooks, hooks);
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

const runtime = new EngineContext();

export { EngineContext };
export default runtime;
