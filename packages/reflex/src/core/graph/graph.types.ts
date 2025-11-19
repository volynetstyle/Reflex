/**
 * @file graph.types.ts
 *
 * Runtime definitions for the Reflex reactive graph.
 */
import { BitMask } from "../object/utils/bitwise.js";
import { arena, NULL } from "./memory/graph.arena.js";

type ReactiveNodeKind = "source" | "computation" | "effect";
type IObserverFn = () => void;

// Кэш proxy узлов (Map<id, GraphNode>) - требует явного очищения в dispose()
const nodeCache = new Map<number, GraphNode>();

function makeProxy(id: number): GraphNode {
  // Горячий путь: быстрая проверка кэша
  let cached = nodeCache.get(id);
  if (cached !== undefined) return cached;

  // Холодный путь: создание нового узла
  const node = new GraphNode(id);
  nodeCache.set(id, node);
  return node;
}

class GraphNode {
  constructor(private readonly __id: number) {}

  static create(kind: ReactiveNodeKind = "source"): GraphNode {
    const id = arena.alloc();
    arena.kind[id] = kind === "source" ? 0 : kind === "computation" ? 1 : 2;
    arena.version[id] = 1;
    arena.epoch[id] = 0;
    arena.valueRaw[id] = undefined;
    return makeProxy(id);
  }

  // === Проксі до SoA ===
  get _firstSource(): GraphNode | null {
    const n = arena.firstSource[this.__id]!;
    return n === NULL ? null : makeProxy(n);
  }
  set _firstSource(v) {
    arena.firstSource[this.__id] = v?.__id ?? NULL;
  }
  get _lastSource(): GraphNode | null {
    const n = arena.lastSource[this.__id]!;
    return n === NULL ? null : makeProxy(n);
  }
  set _lastSource(v) {
    arena.lastSource[this.__id] = v?.__id ?? NULL;
  }
  get _nextSource(): GraphNode | null {
    const n = arena.nextSource[this.__id]!;
    return n === NULL ? null : makeProxy(n);
  }
  set _nextSource(v) {
    arena.nextSource[this.__id] = v?.__id ?? NULL;
  }
  get _prevSource(): GraphNode | null {
    const n = arena.prevSource[this.__id]!;
    return n === NULL ? null : makeProxy(n);
  }
  set _prevSource(v) {
    arena.prevSource[this.__id] = v?.__id ?? NULL;
  }

  get _firstObserver(): GraphNode | null {
    const n = arena.firstObserver[this.__id]!;
    return n === NULL ? null : makeProxy(n);
  }
  set _firstObserver(v) {
    arena.firstObserver[this.__id] = v?.__id ?? NULL;
  }
  get _lastObserver(): GraphNode | null {
    const n = arena.lastObserver[this.__id]!;
    return n === NULL ? null : makeProxy(n);
  }
  set _lastObserver(v) {
    arena.lastObserver[this.__id] = v?.__id ?? NULL;
  }
  get _nextObserver(): GraphNode | null {
    const n = arena.nextObserver[this.__id]!;
    return n === NULL ? null : makeProxy(n);
  }
  set _nextObserver(v) {
    arena.nextObserver[this.__id] = v?.__id ?? NULL;
  }
  get _prevObserver(): GraphNode | null {
    const n = arena.prevObserver[this.__id]!;
    return n === NULL ? null : makeProxy(n);
  }
  set _prevObserver(v) {
    arena.prevObserver[this.__id] = v?.__id ?? NULL;
  }

  get _sourceCount() {
    return arena.sourceCount[this.__id]!;
  }
  set _sourceCount(v: number) {
    arena.sourceCount[this.__id] = v;
  }
  get _observerCount() {
    return arena.observerCount[this.__id]!;
  }
  set _observerCount(v: number) {
    arena.observerCount[this.__id] = v;
  }

  get _flags() {
    return arena.flags[this.__id]!;
  }
  set _flags(v: number) {
    arena.flags[this.__id] = v;
  }
  get _version() {
    return arena.version[this.__id]!;
  }
  set _version(v: number) {
    arena.version[this.__id] = v;
  }
  get _epoch() {
    return arena.epoch[this.__id]!;
  }
  set _epoch(v: number) {
    arena.epoch[this.__id] = v;
  }

  get _valueRaw() {
    return arena.valueRaw[this.__id];
  }
  set _valueRaw(v) {
    arena.valueRaw[this.__id] = v;
  }
  get _observer() {
    return arena.observerFn[this.__id];
  }
  set _observer(v: IObserverFn | null | undefined) {
    arena.observerFn[this.__id] = v ?? null;
  }
  get _kind() {
    const k = arena.kind[this.__id];
    return k === 0 ? "source" : k === 1 ? "computation" : "effect";
  }
  set _kind(v) {
    arena.kind[this.__id] = v === "source" ? 0 : v === "computation" ? 1 : 2;
  }

  // Опціонально: знищення вузла
  dispose() {
    arena.free(this.__id);
    nodeCache.delete(this.__id);
  }
}

type IReactiveNode = GraphNode;

interface IReactiveValue<T = unknown> {
  (): T;
  get(): T;
  set(next: T | ((prev: T) => T)): void;
}

export type { IObserverFn, IReactiveNode, IReactiveValue, ReactiveNodeKind };
export { GraphNode };
