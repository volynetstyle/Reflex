import type ReactiveNode from "./reactivity/shape/ReactiveNode";
import type { ReactiveEdge } from "./reactivity/shape/ReactiveEdge";

export interface EngineHooks {
  onEffectInvalidated?(node: ReactiveNode): void;
}

class EngineContext {
  firstDirty: ReactiveNode | null = null;

  epoch = 1;
  workEpoch = 0;

  activeComputed: ReactiveNode | null = null;
  readonly trawelList: ReactiveNode[] = [];
  readonly edgeStack: (ReactiveEdge | null)[] = [];
  readonly worklist: ReactiveNode[] = [];

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
    this.edgeStack.length = 0;
    this.worklist.length = 0;
    this.workEpoch = 0;
    delete this.hooks.onEffectInvalidated;
    Object.assign(this.hooks, hooks);
  }
}

const runtime = new EngineContext();

export { EngineContext };
export default runtime;
