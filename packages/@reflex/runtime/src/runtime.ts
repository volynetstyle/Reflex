import type ReactiveNode from "./reactivity/shape/ReactiveNode";

export interface EngineHooks {
  onEffectInvalidated?(node: ReactiveNode): void;
}

class EngineContext {
  firstDirty: ReactiveNode | null = null;
  epoch = 1;
  activeComputed: ReactiveNode | null = null;
  readonly trawelList: ReactiveNode[] = [];
  readonly worklist: ReactiveNode[] = [];
  workEpoch = 0;
  readonly hooks: EngineHooks;

  constructor(hooks: EngineHooks = {}) {
    this.hooks = hooks;
  }

  bumpEpoch(): number {
    return ++this.epoch;
  }

  getEpoch(): number {
    return this.epoch;
  }

  notifyEffectInvalidated(node: ReactiveNode): void {
    this.hooks.onEffectInvalidated?.(node);
  }

  reset(hooks: EngineHooks = {}): void {
    this.firstDirty = null;
    this.epoch = 1;
    this.activeComputed = null;
    this.trawelList.length = 0;
    this.worklist.length = 0;
    this.workEpoch = 0;
    delete this.hooks.onEffectInvalidated;
    Object.assign(this.hooks, hooks);
  }
}

const runtime = new EngineContext();

export { EngineContext };
export default runtime;
