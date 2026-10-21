import {
  createConsumer,
  disposeNodeIfUnobserved,
  isTracking,
  disposeNode,
  readConsumerLazy,
  suspendConsumerIfUnobserved,
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
    if (node) suspendConsumerIfUnobserved(node);
  }

  dispose(): void {
    this.disposed = true;
    if (this.node) disposeNode(this.node);
    this.node = undefined;
  }
}

/** Retain tracked semantic locations until their owner's next collection boundary. */
export class Observations<K, T> {
  private entries?: Map<K, ConsumerNode<T>>;
  constructor(
    private readonly compute: (key: K) => T,
    private readonly equals: (a: T, b: T) => boolean = Object.is,
    private readonly keyEquals?: (a: K, b: K) => boolean,
  ) {}

  read(key: K): T {
    const keyEquals = this.keyEquals;
    const entries = this.entries;
    if (keyEquals && entries) {
      const requested = key;
      key = untracked(() => {
        for (const known of entries.keys()) {
          if (keyEquals(known, requested)) return known;
        }
        return requested;
      });
    }
    let node = this.entries?.get(key);

    if (!node) {
      if (!isTracking()) return this.compute(key);
      let initialized = false;
      let previous: T;

      node = createConsumer(() => {
        const next = this.compute(key);
        if (
          !initialized ||
          !(this.equals === Object.is
            ? Object.is(previous, next)
            : untracked(() => this.equals(previous, next)))
        )
          previous = next;
        initialized = true;
        return previous;
      });
      (this.entries ??= new Map()).set(key, node);
    }
    return readConsumerLazy.call(node) as T;
  }

  collect(): void {
    if (!this.entries) return;
    for (const [key, node] of this.entries) {
      if (!disposeNodeIfUnobserved(node)) continue;
      this.entries.delete(key);
    }
  }

  dispose(): void {
    if (!this.entries) return;
    for (const node of this.entries.values()) disposeNode(node);
    this.entries = undefined;
  }
}
