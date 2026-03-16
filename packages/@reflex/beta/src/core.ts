export const enum ReactiveNodeState {
  Invalid = 1,
  Obsolete = 2,
  Ordered = 4,
  Tracking = 8,
}

export const enum ReactiveNodeKind {
  Signal = 0,
  Computed = 1,
  Effect = 2,
}

export const CLEANUP_STATE = ~(
  ReactiveNodeState.Invalid | ReactiveNodeState.Obsolete
);

export class ReactiveEdge {
  nextOut: ReactiveEdge | null = null;
  nextIn: ReactiveEdge | null = null;
  seenEpoch: number = 0;

  constructor(
    public from: ReactiveNode,
    public to: ReactiveNode,
  ) {}
}

export class ReactiveNode {
  value: unknown;
  compute: (() => unknown) | null;
  cleanup: (() => void) | null;
  readonly kind: ReactiveNodeKind;

  changedAt: number;
  computedAt: number;

  state: number;

  firstOut: ReactiveEdge | null;
  firstIn: ReactiveEdge | null;

  trackEpoch: number;

  constructor(
    value: unknown,
    compute: (() => unknown) | null,
    state: number,
    kind: ReactiveNodeKind,
  ) {
    this.value = value;
    this.compute = compute;
    this.cleanup = null;
    this.kind = kind;

    this.changedAt = 0;
    this.computedAt = 0;

    this.state = state;

    this.firstOut = null;
    this.firstIn = null;

    this.trackEpoch = 0;
  }

  get isSignal() {
    return this.kind === ReactiveNodeKind.Signal;
  }

  get isComputed() {
    return this.kind === ReactiveNodeKind.Computed;
  }

  get isEffect() {
    return this.kind === ReactiveNodeKind.Effect;
  }

  get isDirty() {
    return (
      (this.state &
        (ReactiveNodeState.Invalid | ReactiveNodeState.Obsolete)) !==
      0
    );
  }
}

export interface EngineHooks {
  onEffectInvalidated?(node: ReactiveNode): void;
}

export class EngineContext {
  firstDirty: ReactiveNode | null = null;
  epoch: number = 1;
  activeComputed: ReactiveNode | null = null;
  readonly trawelList: ReactiveNode[] = [];
  readonly worklist: ReactiveNode[] = [];
  readonly hooks: EngineHooks;

  constructor(hooks: EngineHooks = {}) {
    this.hooks = hooks;
  }

  bumpEpoch() {
    return ++this.epoch;
  }

  getEpoch() {
    return this.epoch;
  }

  notifyEffectInvalidated(node: ReactiveNode) {
    this.hooks.onEffectInvalidated?.(node);
  }
}
