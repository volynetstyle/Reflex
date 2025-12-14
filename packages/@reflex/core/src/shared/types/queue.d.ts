interface Queueable<T> {
  enqueue(value: T): void | Async<void>;
  dequeue(): T | undefined | Async<T>;
  isEmpty?(): boolean;
  clear?(): void;
  close?(): void;
  [Symbol.asyncIterator]?(): AsyncIterator<T>;
}

interface QueueableLike<T> {
  enqueue?: (value: T) => unknown;
  dequeue?: () => T | Async<T> | undefined;
}
