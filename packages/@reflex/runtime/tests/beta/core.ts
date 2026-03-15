export const enum ReactiveNodeState {
  Invalid = 1 << 0,
  Obsolete = 1 << 1,
  Ordered = 1 << 2,
}

export class ReactiveEdge {
  nextOut: ReactiveEdge | null = null;
  nextIn: ReactiveEdge | null = null;
  constructor(
    public from: ReactiveNode,
    public to: ReactiveNode,
  ) {}
}

export class ReactiveNode {
  value: unknown = undefined;
  compute: (() => unknown) | null = null;
  changedAt: number = 0;
  computedAt: number = 0;
  state: number = ReactiveNodeState.Ordered;
  
  prev: ReactiveNode | null = null;
  next: ReactiveNode | null = null;

  dirtyPrev: ReactiveNode | null = null;
  dirtyNext: ReactiveNode| null = null;
 
  order: number = 0;
  firstOut: ReactiveEdge | null = null;
  firstIn: ReactiveEdge | null = null;

  // dynamic dependency tracking
  // набір ребер що були живими у попередньому compute-циклі
  prevEdges: Set<ReactiveEdge> = new Set();

  get isSignal() {
    return this.compute === null;
  }
  get isDirty() {
    return (
      (this.state &
        (ReactiveNodeState.Invalid | ReactiveNodeState.Obsolete)) !==
      0
    );
  }
}

export class EngineContext {
  firstDirty: ReactiveNode | null = null;
  epoch: number = 1;
  // вузол що зараз обчислюється — для автоматичного tracking
  activeComputed: ReactiveNode | null = null;

  bumpEpoch() {
    return ++this.epoch;
  }
  getEpoch() {
    return this.epoch;
  }
}
