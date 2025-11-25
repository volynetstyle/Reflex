import { GraphNode } from "../../core/graph/graph.node";
import { IReactiveValue } from "../../core/graph/graph.types";
import { IOwnership } from "../../core/ownership/ownership.type";

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

export function createSignal<T>(
  owner: IOwnership | null,
  value: T,
): IReactiveValue<T> {
  const graphNode = new GraphNode();
  const signal = new Signal(value, owner, graphNode);

  const reactive: IReactiveValue<T> = ((newValue?: T): T | void => {
    return arguments.length === 0 ? signal.get() : signal.set(newValue as T);
  }) as IReactiveValue<T>;

  reactive.get = () => signal.get();
  reactive.set = (v: T) => signal.set(v);

  owner?.onScopeCleanup(() => {
    // signal.cleanup();
    // graphNode.cleanup?.();
  });

  return reactive;
}
