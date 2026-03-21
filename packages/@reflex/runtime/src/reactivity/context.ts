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

  notifyEffectInvalidated(node: ReactiveNode): void {
    this.hooks.onEffectInvalidated?.(node);
  }

  reset(hooks: EngineHooks = {}): void {
    this.activeComputed = null;
    this.propagateStack.length = 0;
    this.dirtyCheckStack.length = 0;
    delete this.hooks.onEffectInvalidated;
    Object.assign(this.hooks, hooks);
  }
}

const runtime = new EngineContext();

export { EngineContext };
export default runtime;
