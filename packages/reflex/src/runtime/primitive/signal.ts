import { IReactiveNode, IReactiveValue } from "../../core/graph/graph.types";
import { IOwnership } from "../../core/ownership/ownership.type";

class Signal<T> {
  private readonly owner: IOwnership | null;
  private readonly _node: IReactiveNode;

  constructor(value: T, owner: IOwnership | null, node: IReactiveNode) {
    this.owner = owner;

    node._valueRaw = value;
    node._kind = "source";

    this._node = node;
  }

  get(): T {
    return this._node._valueRaw as T;
  }

  set(value: T): void {
    this._node._valueRaw = value;

    // will started a loooong work here...
  }
}

export function createSignal<T>(
  value: T,
  owner: IOwnership | null,
  node: IReactiveNode,
): IReactiveValue<T> {
  const s = new Signal(value, owner, node);
  const fn = s as unknown as IReactiveValue<T>;

  return fn;
}
