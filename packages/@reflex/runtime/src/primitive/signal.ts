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

export function createSignal<T>(initial: T): IReactiveValue<T> {
  const { layout, graph, scheduler } = RUNTIME;

  const index = layout.alloc();
  const node = graph.createNode(index);

  const signal = new Signal(initial, node, layout, scheduler);

  function read(): T {
    return signal.get();
  }
  const reactive = read as IReactiveValue<T>;
  reactive.set = (v: T) => signal.set(v);
  reactive.node = node;

  owner?.onScopeCleanup(() => signal.cleanup());
  return reactive;
}
