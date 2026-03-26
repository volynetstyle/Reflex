import type { ReactiveNode } from "./shape";

export interface EngineHooks {
  onEffectInvalidated?(node: ReactiveNode): void;
  onReactiveSettled?(): void;
}

class EngineContext {
  activeComputed: ReactiveNode | null = null;
  propagationDepth = 0;
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
  }

  setHooks(hooks: EngineHooks = {}): void {
    delete this.hooks.onEffectInvalidated;
    Object.assign(this.hooks, hooks);
  }
}

const runtime = new EngineContext();

export { EngineContext };
export default runtime;
