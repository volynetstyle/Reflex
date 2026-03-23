import type { ReactiveEdge, ReactiveNode } from "./shape";

export interface EngineHooks {
  onEffectInvalidated?(node: ReactiveNode): void;
}

class EngineContext {
  activeComputed: ReactiveNode | null = null;
  readonly propagateStack: ReactiveEdge[] = [];
  readonly dirtyCheckStack: ReactiveEdge[] = [];
  readonly hooks: EngineHooks;

  constructor(hooks: EngineHooks = {}) {
    this.hooks = hooks;
  }

  dispatchWatcherEvent(node: ReactiveNode): void {
    this.hooks.onEffectInvalidated?.(node);
  }

  resetState(): void {
    this.activeComputed = null;
    this.propagateStack.length = 0;
    this.dirtyCheckStack.length = 0;
  }

  setHooks(hooks: EngineHooks = {}): void {
    delete this.hooks.onEffectInvalidated;
    Object.assign(this.hooks, hooks);
  }
}

const runtime = new EngineContext();

export { EngineContext };
export default runtime;
