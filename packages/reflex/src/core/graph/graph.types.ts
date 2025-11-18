/**
 * @file graph.types.ts
 *
 * Runtime definitions for the Reflex reactive graph.
 */
import { BitMask } from "../object/utils/bitwise.js";

type ReactiveNodeKind = "source" | "computation" | "effect";
type IObserverFn = () => void;

class GraphNode {
  _firstSource: GraphNode | null;
  _lastSource: GraphNode | null;
  _nextSource: GraphNode | null;
  _prevSource: GraphNode | null;

  _firstObserver: GraphNode | null;
  _lastObserver: GraphNode | null;
  _nextObserver: GraphNode | null;
  _prevObserver: GraphNode | null;

  _sourceCount: number;
  _observerCount: number;

  _flags: BitMask;
  _version: number;
  _epoch: number;

  _valueRaw: unknown;
  _observer: IObserverFn | null;
  _kind: ReactiveNodeKind;

  constructor() {
    this._firstSource = null;
    this._lastSource = null;
    this._nextSource = null;
    this._prevSource = null;

    this._firstObserver = null;
    this._lastObserver = null;
    this._nextObserver = null;
    this._prevObserver = null;

    this._sourceCount = 0;
    this._observerCount = 0;

    this._flags = 0;
    this._version = 0;
    this._epoch = 0;
    
    this._valueRaw = undefined;
    this._observer = null;
    this._kind = "source";
  }
}

type IReactiveNode = GraphNode;

interface IReactiveValue<T = unknown> {
  (): T;
  (next: T | ((prev: T) => T)): void;
  readonly _node: IReactiveNode;
}

export type { IObserverFn, IReactiveNode, IReactiveValue, ReactiveNodeKind };
export { GraphNode };
