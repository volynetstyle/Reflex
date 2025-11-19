import {
  GraphNode,
  IReactiveNode,
  IReactiveValue,
} from "../../core/graph/graph.types";
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
  owner: IOwnership | null,
  value: T,
): IReactiveValue<T> {
  const graphNode = new GraphNode();
  const signal = new Signal(value, owner, graphNode);

  const get = () => signal.get();
  const set = signal.set;

  const fn = get as IReactiveValue<T>;

  fn.get = get;
  fn.set = set;

  return fn;
}

const signal = createSignal(null, 10);

signal();
signal.set(20);
