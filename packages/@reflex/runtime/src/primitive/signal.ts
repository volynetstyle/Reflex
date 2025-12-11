
class Signal<T> {
  private value: T;
  private readonly owner: IOwnership | null;
  private readonly _node: GraphNode;

  constructor(value: T, owner: IOwnership | null, node: GraphNode) {
    this.value = value;
    this.owner = owner;
    this._node = node;
  }

  dispose(): void {
    // cleanup logic here
  }

  get(): T {
    return this.value;
  }

  set(value: T): void {
    // will started a loooong work here...
  }
}

class ReactiveValue<T> {
  constructor(private signal: Signal<T>) {}

  get() {
    return this.signal.get();
  }

  set(v: T) {
    return this.signal.set(v);
  }
}

export const createSignal = <T>(
  owner: IOwnership | null,
  value: T,
): ReactiveValue<T> => {
  const node = new GraphNode();
  const signal = new Signal(value, owner, node);
  const reactive = new ReactiveValue(signal);
  // owner?.onScopeCleanup(signal.cleanup);
  return reactive;
};

const s = createSignal({}, 1);
