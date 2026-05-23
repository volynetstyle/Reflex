declare const __DEV__: boolean;

interface SymbolConstructor {
  readonly dispose: unique symbol;
}

/**
 * Cleanup function returned from an effect.
 */
type Destructor = () => void;

/**
 * Effect callback.
 * May return a cleanup function.
 */
type EffectFn = () => void | Destructor;

interface EffectOptions {
  priority?: number;
}

type AnyFn = (...args: never[]) => unknown;

/**
 * Direct value that can be assigned via `.set(value)`.
 * Function values are excluded to avoid ambiguity with updater functions.
 */
type DirectValue<T> = Exclude<T, AnyFn>;

type Updater<T> = (prev: T) => T;
/**
 * Accepted input for writable reactive values.
 */
type SetInput<T> = DirectValue<T> | Updater<T>;

type Setter<T> = undefined extends T
  ? {
      (): T;
      (value: SetInput<T>): T;
    }
  : (value: SetInput<T>) => T;

/**
 * Tracked callable read.
 */
type Accessor<T> = () => T;

/**
 * Property-based read.
 */
interface ValueReadable<T> {
  readonly value: T;
}

/**
 * Untracked read.
 */
interface Peekable<T> {
  peek(): T;
}

/**
 * Writable capability.
 */
interface Writable<T> {
  set: Setter<T>;
}

interface Disposable {
  (): void;
}

/**
 * Standard readable reactive value.
 */
type Readable<T> = Accessor<T> & ValueReadable<T>;

/**
 * Readable value with untracked read.
 */
type PeekableReadable<T> = Readable<T> & Peekable<T>;

/**
 * Writable signal-like value.
 */
type WritableReadable<T> = Readable<T> & Writable<T>;

/**
 * Writable signal-like value with untracked read.
 */
type PeekableWritableReadable<T> = WritableReadable<T> & Peekable<T>;

/**
 * Core reactive shapes.
 */
type Signal<T> = PeekableWritableReadable<T>;
type Computed<T> = PeekableReadable<T>;
type Memo<T> = PeekableReadable<T>;
type Derived<T> = PeekableReadable<T>;

type Effect<T = void> = Readable<T> & Disposable;
type Scan<T> = Readable<T> & Disposable;

/**
 * Push-based realtime source.
 */
type Realtime<T> = PeekableWritableReadable<T> & {
  subscribe(cb: () => void): () => void;
};

/**
 * Async iterable stream source.
 */
type Stream<T> = PeekableWritableReadable<T> & AsyncIterable<T>;

/**
 * Common readonly view over reactive values.
 */
type ReadableLike<T> =
  | Signal<T>
  | Computed<T>
  | Memo<T>
  | Derived<T>
  | Realtime<T>
  | Stream<T>;

/**
 * Common writable view over reactive values.
 */
type WritableLike<T> = Signal<T> | Realtime<T> | Stream<T>;

/**
 * Extract value type from a reactive value.
 */
type ValueOf<T> =
  T extends Accessor<infer V>
    ? V
    : T extends ValueReadable<infer V>
      ? V
      : never;
