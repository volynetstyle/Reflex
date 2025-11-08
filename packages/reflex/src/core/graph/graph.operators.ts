import { BitMask } from "../object/utils/bitwise.js";
import { GraphOperations, IObserver, ISource } from "./graph.types.js";

interface IGraphVertex extends IObserver, ISource {}

const GraphOperations: GraphOperations<IGraphVertex> = {
  connect(target: IGraphVertex): boolean {
    return true;
  },

  disconnect(target?: IGraphVertex | undefined): void {
    throw new Error("Function not implemented.");
  },

  markDirty(mask?: BitMask): void {
    throw new Error("Function not implemented.");
  },

  notifyObservers(mask?: BitMask): void {
    throw new Error("Function not implemented.");
  },

  addSource(source: IGraphVertex): void {
    throw new Error("Function not implemented.");
  },

  removeSource(source: IGraphVertex): void {
    throw new Error("Function not implemented.");
  },

  traverse(direction: "up" | "down", visitor: (v: IGraphVertex) => void): void {
    const stableVisitor = visitor;

    throw new Error("Function not implemented.");
  },

  isIsolated(): boolean {
    throw new Error("Function not implemented.");
  },

  dispose(): void {
    throw new Error("Function not implemented.");
  },

  updateDirtyValues(): void {
    throw new Error("Function not implemented.");
  },
};

export function createGraphNode<T extends object = {}>(
  vertex?: T & Partial<IGraphVertex>
): IGraphVertex {
  return {
    _value: 0,
    _sources: [],
    _observers: [],
    _flags: 0,
    _epoch: 0,
    ...vertex,
    ...GraphOperations,
  };
}
