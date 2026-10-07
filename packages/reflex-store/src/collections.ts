import {
  createProducer,
  currentConsumer,
  disposeNode,
  enterReactiveBatch,
  leaveReactiveBatch,
  readProducer,
  untracked,
  writeProducer,
  type ProducerNode,
} from "@volynets/reflex-runtime/internal";
import { storeControls } from "./values";
import { batch } from "@volynets/reflex";
import { setStoreName } from "./internal/names";

/** Publish a synchronous logical action at one runtime batch boundary. */
export function transaction<T>(action: () => T): T {
  return batch(() => {
    enterReactiveBatch();
    try {
      return action();
    } finally {
      leaveReactiveBatch();
    }
  });
}

class Cells<K, V> {
  // Values live outside producer payloads so foreign objects remain valid even
  // when runtime dev validation accepts only primitive/plain payloads.
  private readonly nodes = new Map<
    K,
    { node: ProducerNode<number>; value: V }
  >();
  read(key: K, value: V): V {
    if (currentConsumer === null) return value;
    let entry = this.nodes.get(key);
    if (!entry) {
      entry = { node: createProducer(0), value };
      this.nodes.set(key, entry);
    }
    readProducer(entry.node);
    return value;
  }
  write(key: K, value: V): void {
    const entry = this.nodes.get(key);
    if (!entry || Object.is(entry.value, value)) return;
    entry.value = value;
    writeProducer(entry.node, entry.node.payload + 1);
  }
  collect(): void {
    for (const [key, { node }] of this.nodes) {
      if (node.firstOut !== null) continue;
      this.nodes.delete(key);
      disposeNode(node);
    }
  }
  dispose(): void {
    for (const { node } of this.nodes.values()) disposeNode(node);
    this.nodes.clear();
  }
}

export interface ReactiveMapOptions<V> {
  name?: string;
  /** Values are reference boundaries; equivalent replacements retain the old value. */
  equals?: (previous: V, next: V) => boolean;
}

export class ReactiveMap<K, V> implements Iterable<[K, V]> {
  private data?: Map<K, V>;
  private disposed = false;
  private readonly valuesByKey = new Cells<K, V | undefined>();
  private readonly existsByKey = new Cells<K, boolean>();
  private readonly structure = new Cells<"size" | "keys" | "values", number>();
  private keyVersion = 0;
  private valueVersion = 0;

  constructor(
    private initial?:
      | Iterable<readonly [K, V]>
      | (() => Iterable<readonly [K, V]>),
    private readonly options: ReactiveMapOptions<V> = {},
  ) {
    setStoreName(this, options.name);
    storeControls.set(this, {
      raw: () => this.backing(),
      collect: () => this.collect(),
      dispose: () => this.dispose(),
    });
  }

  private backing(): Map<K, V> {
    if (this.disposed) throw new Error("Cannot use a disposed reactive map");
    if (!this.data) {
      this.data = untracked(
        () =>
          new Map(
            typeof this.initial === "function" ? this.initial() : this.initial,
          ),
      );
      this.initial = undefined;
    }
    return this.data;
  }

  get size(): number {
    return this.structure.read("size", this.backing().size);
  }
  get [Symbol.toStringTag](): string {
    return "ReactiveMap";
  }
  get(key: K): V | undefined {
    return this.valuesByKey.read(key, this.backing().get(key));
  }
  has(key: K): boolean {
    return this.existsByKey.read(key, this.backing().has(key));
  }

  set(key: K, value: V): this {
    const data = this.backing();
    const existed = data.has(key);
    if (
      existed &&
      untracked(() => (this.options.equals ?? Object.is)(data.get(key)!, value))
    )
      return this;
    transaction(() => {
      data.set(key, value);
      this.valuesByKey.write(key, value);
      if (!existed) {
        this.existsByKey.write(key, true);
        this.structure.write("size", data.size);
        this.structure.write("keys", ++this.keyVersion);
      }
      this.structure.write("values", ++this.valueVersion);
    });
    return this;
  }

  delete(key: K): boolean {
    const data = this.backing();
    if (!data.has(key)) return false;
    transaction(() => {
      data.delete(key);
      this.valuesByKey.write(key, undefined);
      this.existsByKey.write(key, false);
      this.structure.write("size", data.size);
      this.structure.write("keys", ++this.keyVersion);
      this.structure.write("values", ++this.valueVersion);
    });
    return true;
  }

  clear(): void {
    const data = this.backing();
    if (data.size === 0) return;
    transaction(() => {
      const keys = Array.from(data.keys());
      data.clear();
      for (const key of keys) {
        this.valuesByKey.write(key, undefined);
        this.existsByKey.write(key, false);
      }
      this.structure.write("size", 0);
      this.structure.write("keys", ++this.keyVersion);
      this.structure.write("values", ++this.valueVersion);
    });
  }

  keys(): MapIterator<K> {
    const data = this.backing();
    this.structure.read("keys", this.keyVersion);
    return data.keys();
  }
  values(): MapIterator<V> {
    const data = this.backing();
    this.structure.read("values", this.valueVersion);
    return data.values();
  }
  entries(): MapIterator<[K, V]> {
    const data = this.backing();
    this.structure.read("values", this.valueVersion);
    return data.entries();
  }
  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries();
  }
  forEach(
    callback: (value: V, key: K, map: ReactiveMap<K, V>) => void,
    thisArg?: unknown,
  ): void {
    const data = this.backing();
    this.structure.read("values", this.valueVersion);
    data.forEach((value, key) => callback.call(thisArg, value, key, this));
  }

  collect(): void {
    this.valuesByKey.collect();
    this.existsByKey.collect();
    this.structure.collect();
  }
  [Symbol.dispose](): void {
    this.dispose();
  }

  dispose(): void {
    this.disposed = true;
    this.valuesByKey.dispose();
    this.existsByKey.dispose();
    this.structure.dispose();
    this.data = undefined;
    this.initial = undefined;
  }
}

/** A native Set-shaped membership collection over keyed reactive observations. */
export class ReactiveSet<T> implements Iterable<T> {
  private readonly members: ReactiveMap<T, true>;
  constructor(
    initial?: Iterable<T> | (() => Iterable<T>),
    options: { name?: string } = {},
  ) {
    this.members = new ReactiveMap(() =>
      Array.from(
        typeof initial === "function" ? initial() : (initial ?? []),
        (value) => [value, true] as const,
      ),
    );
    setStoreName(this, options.name);
    storeControls.set(this, {
      raw: () => new Set(this.members.keys()),
      collect: () => this.collect(),
      dispose: () => this.dispose(),
    });
  }
  get size(): number {
    return this.members.size;
  }
  get [Symbol.toStringTag](): string {
    return "ReactiveSet";
  }
  has(value: T): boolean {
    return this.members.has(value);
  }
  add(value: T): this {
    this.members.set(value, true);
    return this;
  }
  delete(value: T): boolean {
    return this.members.delete(value);
  }
  clear(): void {
    this.members.clear();
  }
  values(): MapIterator<T> {
    return this.members.keys();
  }
  keys(): MapIterator<T> {
    return this.values();
  }
  *entries(): IterableIterator<[T, T]> {
    for (const value of this.values()) yield [value, value];
  }
  [Symbol.iterator](): MapIterator<T> {
    return this.values();
  }
  forEach(
    callback: (value: T, key: T, set: ReactiveSet<T>) => void,
    thisArg?: unknown,
  ): void {
    for (const value of this.values())
      callback.call(thisArg, value, value, this);
  }
  collect(): void {
    this.members.collect();
  }
  dispose(): void {
    this.members.dispose();
  }
  [Symbol.dispose](): void {
    this.dispose();
  }
}

export function reactiveSet<T>(
  initial?: Iterable<T> | (() => Iterable<T>),
  options?: { name?: string },
): ReactiveSet<T> {
  return new ReactiveSet(initial, options);
}

export function createReactiveMap<K, V>(
  initial?: Iterable<readonly [K, V]> | (() => Iterable<readonly [K, V]>),
  options?: ReactiveMapOptions<V>,
): ReactiveMap<K, V> {
  return new ReactiveMap(initial, options);
}
