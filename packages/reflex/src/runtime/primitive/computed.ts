import { GraphNode, IReactiveNode } from "../../core/graph/graph.types";
import { IOwnership } from "../../core/ownership/ownership.type";

class Computed<T> {
  private readonly owner: IOwnership | null;
  private readonly _node: IReactiveNode;
  private readonly computeFn: () => T;
  private cachedValue: T | null;

  constructor(
    owner: IOwnership | null,
    computeFn: () => T,
    node: IReactiveNode,
  ) {
    this.owner = owner;
    this._node = node;
    this._node._kind = "computation";
    this.computeFn = computeFn;
    this.cachedValue = null;
  }

  get(): T {
    if (this.cachedValue === null) {
      return this.compute();
    }

    return this.cachedValue;
  }

  compute(): T {
    const newValue = this.computeFn();
    this.cachedValue = newValue;
    return newValue;
  }
}

export function createComputed<T>(
  owner: IOwnership | null,
  computeFn: () => T,
): () => T {
  const graphNode = new GraphNode();
  const computed = new Computed(owner, computeFn, graphNode);
    return () => computed.get();
}