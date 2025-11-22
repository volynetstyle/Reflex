import { GraphNode } from "../../core/graph/graph.node";
import { IReactiveValue } from "../../core/graph/graph.types";
import { IOwnership } from "../../core/ownership/ownership.type";

const GET = 0;

class Signal<T = unknown> {
  private _valueRaw: T;
  private readonly _owner: IOwnership | null;
  private readonly _node: GraphNode;

  constructor(value: T, owner: IOwnership | null) {
    this._valueRaw = value;
    this._owner = owner;
    this._node = new GraphNode();
  }

  dispose(): void {
    // this._node.dispose();
    // cleanup logic here
  }

  get(): T {
    return this._valueRaw;
  }

  set(value: T): void {
    if (typeof value === "function") {
      value = value(this._valueRaw);
    }

    if (Object.is(value, this._valueRaw)) return;

    // this.valueReceived(value)
  }
}

export function createSignal<T>(
  owner: IOwnership | null,
  value: T,
): IReactiveValue<T> {
  const signal = new Signal(value, owner);

  const reactive: IReactiveValue<T> = ((newValue?: T): T | void => {
    return arguments.length === GET ? signal.get() : signal.set(newValue as T);
  }) as IReactiveValue<T>;

  reactive.get = () => signal.get();
  reactive.set = (v: T) => signal.set(v);

  owner?.onScopeCleanup(signal.dispose);

  return reactive;
}
