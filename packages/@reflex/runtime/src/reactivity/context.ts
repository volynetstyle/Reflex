import type { ReactiveNode } from "./shape";

export interface EngineHooks {
  onEffectInvalidated?(node: ReactiveNode): void;
}

class EngineContext {
  activeComputed: ReactiveNode | null = null;
  readonly hooks: EngineHooks;

  constructor(hooks: EngineHooks = {}) {
    this.hooks = hooks;
  }

  dispatchWatcherEvent(node: ReactiveNode): void {
    this.hooks.onEffectInvalidated?.(node);
  }

  resetState(): void {
    this.activeComputed = null;
  }

  setHooks(hooks: EngineHooks = {}): void {
    delete this.hooks.onEffectInvalidated;
    Object.assign(this.hooks, hooks);
  }
}

const runtime = new EngineContext();

export { EngineContext };
export default runtime;
