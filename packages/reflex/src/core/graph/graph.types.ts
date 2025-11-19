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
    arena.setKind(id, kind === "source" ? 0 : kind === "computation" ? 1 : 2);
    arena.setVersion(id, 1);
    arena.setEpoch(id, 0);
    arena.setValueRaw(id, undefined);
    return makeProxy(id);
  }

  // === Проксі до AoS ===
  get _firstSource(): GraphNode | null {
    const n = arena.getFirstSource(this.__id);
    return n === NULL ? null : makeProxy(n);
  }
  set _firstSource(v) {
    arena.setFirstSource(this.__id, v?.__id ?? NULL);
  }
  get _lastSource(): GraphNode | null {
    const n = arena.getLastSource(this.__id);
    return n === NULL ? null : makeProxy(n);
  }
  set _lastSource(v) {
    arena.setLastSource(this.__id, v?.__id ?? NULL);
  }
  get _nextSource(): GraphNode | null {
    const n = arena.getNextSource(this.__id);
    return n === NULL ? null : makeProxy(n);
  }
  set _nextSource(v) {
    arena.setNextSource(this.__id, v?.__id ?? NULL);
  }
  get _prevSource(): GraphNode | null {
    const n = arena.getPrevSource(this.__id);
    return n === NULL ? null : makeProxy(n);
  }
  set _prevSource(v) {
    arena.setPrevSource(this.__id, v?.__id ?? NULL);
  }

  get _firstObserver(): GraphNode | null {
    const n = arena.getFirstObserver(this.__id);
    return n === NULL ? null : makeProxy(n);
  }
  set _firstObserver(v) {
    arena.setFirstObserver(this.__id, v?.__id ?? NULL);
  }
  get _lastObserver(): GraphNode | null {
    const n = arena.getLastObserver(this.__id);
    return n === NULL ? null : makeProxy(n);
  }
  set _lastObserver(v) {
    arena.setLastObserver(this.__id, v?.__id ?? NULL);
  }
  get _nextObserver(): GraphNode | null {
    const n = arena.getNextObserver(this.__id);
    return n === NULL ? null : makeProxy(n);
  }
  set _nextObserver(v) {
    arena.setNextObserver(this.__id, v?.__id ?? NULL);
  }
  get _prevObserver(): GraphNode | null {
    const n = arena.getPrevObserver(this.__id);
    return n === NULL ? null : makeProxy(n);
  }
  set _prevObserver(v) {
    arena.setPrevObserver(this.__id, v?.__id ?? NULL);
  }

  get _sourceCount() {
    return arena.getSourceCount(this.__id);
  }
  set _sourceCount(v: number) {
    arena.setSourceCount(this.__id, v);
  }
  get _observerCount() {
    return arena.getObserverCount(this.__id);
  }
  set _observerCount(v: number) {
    arena.setObserverCount(this.__id, v);
  }

  get _flags() {
    return arena.getFlags(this.__id);
  }
  set _flags(v: number) {
    arena.setFlags(this.__id, v);
  }
  get _version() {
    return arena.getVersion(this.__id);
  }
  set _version(v: number) {
    arena.setVersion(this.__id, v);
  }
  get _epoch() {
    return arena.getEpoch(this.__id);
  }
  set _epoch(v: number) {
    arena.setEpoch(this.__id, v);
  }

  get _valueRaw() {
    return arena.getValueRaw(this.__id);
  }
  set _valueRaw(v) {
    arena.setValueRaw(this.__id, v);
  }
  get _observer() {
    return arena.getObserverFn(this.__id);
  }
  set _observer(v: IObserverFn | null | undefined) {
    arena.setObserverFn(this.__id, v ?? null);
  }
  get _kind() {
    const k = arena.getKind(this.__id);
    return k === 0 ? "source" : k === 1 ? "computation" : "effect";
  }
  set _kind(v) {
    arena.setKind(this.__id, v === "source" ? 0 : v === "computation" ? 1 : 2);
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
