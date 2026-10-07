import {
  CONSUMER_INITIAL_STATE,
  createConsumer,
  currentConsumer,
  disposeNode,
  readConsumerLazy,
  unlinkAllSources,
  untracked,
  type ConsumerNode,
} from "@volynets/reflex-runtime/internal";

/** A memo with owner-controlled suspension; no node exists until its first read. */
export class Demand<T> {
  private node?: ConsumerNode<T>;
  private disposed = false;
  constructor(private readonly compute: () => T) {}

  read(): T {
    if (this.disposed)
      throw new Error("Cannot read a disposed store derivation");
    const node = (this.node ??= createConsumer(this.compute));
    return readConsumerLazy.call(node) as T;
  }

  peek(): T {
    return untracked(() => this.read());
  }

  collect(): void {
    const node = this.node;
    if (!node || node.firstOut !== null) return;
    unlinkAllSources(node);
    node.state = CONSUMER_INITIAL_STATE;
    node.payload = undefined as T;
  }

  dispose(): void {
    this.disposed = true;
    if (this.node) disposeNode(this.node);
    this.node = undefined;
  }
}

/** Retain tracked semantic locations until their owner's next collection boundary. */
export class Observations<K, T> {
  private readonly entries = new Map<K, ConsumerNode<T>>();
  constructor(
    private readonly compute: (key: K) => T,
    private readonly equals: (a: T, b: T) => boolean = Object.is,
    private readonly keyEquals?: (a: K, b: K) => boolean,
  ) {}

  read(key: K): T {
    if (this.keyEquals) {
      for (const known of this.entries.keys()) {
        if (this.keyEquals(known, key)) {
          key = known;
          break;
        }
      }
    }
    let node = this.entries.get(key);

    if (!node) {
      if (currentConsumer === null) return this.compute(key);
      let initialized = false;
      let previous: T;
      
      node = createConsumer(() => {
        const next = this.compute(key);
        if (!initialized || !untracked(() => this.equals(previous, next)))
          previous = next;
        initialized = true;
        return previous;
      });
      this.entries.set(key, node);
    }
    return readConsumerLazy.call(node) as T;
  }

  collect(): void {
    for (const [key, node] of this.entries) {
      if (node.firstOut !== null) continue;
      this.entries.delete(key);
      disposeNode(node);
    }
  }

  dispose(): void {
    for (const node of this.entries.values()) disposeNode(node);
    this.entries.clear();
  }
}
