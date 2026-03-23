declare const __DEV__: boolean;

/**
 * Cleanup function returned from an effect.
 */
type Destructor = () => void;

/**
 * Effect callback.
 * May return a cleanup function.
 */
type EffectFn = () => void | Destructor;

type AnyFn = (...args: unknown[]) => unknown;

/**
 * Direct value that can be assigned via `.set(value)`.
 * Function values are excluded to avoid ambiguity with updater functions.
 */
type DirectValue<T> = Exclude<T, AnyFn>;

/**
 * Functional updater.
 */
type Updater<T> = (prev: T) => T;

/**
 * Accepted input for writable reactive values.
 */
type SetInput<T> = DirectValue<T> | Updater<T>;

interface RequiredSetter<T> {
  (value: SetInput<T>): T;
}

interface OptionalSetter<T> {
  (): T;
  (value: SetInput<T>): T;
}

/**
 * If T includes undefined, calling `set()` with no arguments is allowed.
 */
type Setter<T> = undefined extends T ? OptionalSetter<T> : RequiredSetter<T>;

/**
 * Nominal brand helper for semantically distinct reactive primitives.
 */
interface Brand<K extends string> {
  readonly __brand?: K;
}

/**
 * Callable tracked read.
 */
interface Accessor<T> {
  (): T;
}

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
  dispose(): void;
}

/**
 * Standard readable reactive value.
 */
interface Readable<T> extends Accessor<T>, ValueReadable<T> {}

/**
 * Readable value with untracked read.
 */
interface PeekableReadable<T> extends Readable<T>, Peekable<T> {}

/**
 * Writable signal-like value.
 */
interface WritableReadable<T> extends Readable<T>, Writable<T> {}

/**
 * Writable signal-like value with untracked read.
 */
interface PeekableWritableReadable<T>
  extends WritableReadable<T>,
    Peekable<T> {}

/**
 * Mutable signal.
 */
interface Signal<T> extends PeekableWritableReadable<T>, Brand<"signal"> {}

/**
 * Computed reactive value.
 */
interface Computed<T> extends PeekableReadable<T>, Brand<"computed"> {}

/**
 * Memoized derived value.
 */
interface Memo<T> extends PeekableReadable<T>, Brand<"memo"> {}

/**
 * Derived reactive value.
 */
interface Derived<T> extends PeekableReadable<T>, Brand<"derived"> {}

interface Effect<T> extends Readable<T>, Brand<"effect">, Disposable {}

interface Scan<T> extends Readable<T>, Brand<"scan">, Disposable {}

/**
 * Push-based realtime source.
 */
interface Realtime<T> extends PeekableWritableReadable<T>, Brand<"realtime"> {
  subscribe(cb: () => void): () => void;
}

/**
 * Async iterable stream source.
 */
interface Stream<T> extends PeekableWritableReadable<T>, Brand<"stream"> {
  [Symbol.asyncIterator](): AsyncIterator<T>;
}

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
