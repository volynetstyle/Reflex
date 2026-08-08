declare const __DEV__: boolean;
declare const __PROFILE__: boolean;

interface SymbolConstructor {
  readonly dispose: unique symbol;
}

/**
 * Any callable value.
 *
 * Used only for excluding function values from direct setter input.
 */
type AnyFn = (...args: never[]) => unknown;

/**
 * Cleanup function returned from an effect.
 */
type Destructor = () => void;

/**
 * Effect callback.
 *
 * Effects are synchronous.
 * Returning a Promise is intentionally not supported.
 */
type EffectFn = () => void | Destructor;

interface EffectOptions {
  priority?: number;
}

/**
 * Direct value that may be assigned with `.set(value)`.
 *
 * Function values are intentionally excluded because a function passed to
 * `.set(...)` is always treated as an updater.
 *
 * For function-valued signals, wrap the function in an object or use a
 * dedicated API later, e.g. `.replace(fn)`, if Reflex adds one.
 */
type DirectValue<T> = T extends AnyFn ? never : T;

/**
 * Functional updater for writable values.
 */
type Updater<T> = (prev: T) => T;

/**
 * Input accepted by writable reactive values.
 *
 * Contract:
 * - non-function input is treated as a direct value;
 * - function input is treated as an updater;
 * - Promise-like input is rejected in dev mode at runtime;
 * - Promise-like updater result is rejected in dev mode at runtime.
 */
type SetInput<T> = DirectValue<T> | Updater<T>;

/**
 * Setter for writable reactive values.
 *
 * Contract:
 * - commits synchronously;
 * - returns the committed value;
 * - does not accept omitted argument unless `undefined` is part of `T`;
 * - does not accept direct function values.
 */
type Setter<T> = undefined extends T
  ? {
      (): T;
      (input: SetInput<T>): T;
    }
  : {
      (input: SetInput<T>): T;
    };

/**
 * Tracked callable read.
 *
 * Calling this inside computed/memo/effect tracks a dependency.
 */
type Accessor<T> = () => T;

/**
 * Property-based tracked read.
 *
 * Reading `.value` tracks a dependency.
 */
interface ValueReadable<T> {
  readonly value: T;
}

/**
 * Untracked read.
 *
 * Does not register a dependency.
 */
// interface Peekable<T> {
//   peek(): T;
// }

/**
 * Writable capability.
 */
interface Writable<T> {
  set: Setter<T>;
}

/**
 * Callable dispose handle.
 */
interface Disposable {
  (): void;
}

/**
 * Symbol-based disposable protocol.
 *
 * Useful for `using` / `Symbol.dispose` integration.
 */
interface SymbolDisposable {
  [Symbol.dispose](): void;
}

/**
 * Standard readable reactive value.
 */
type Readable<T> = Accessor<T> & ValueReadable<T>;

/**
 * Readable value with untracked read.
 */
type Readable<T> = Readable<T> ;

/**
 * Writable readable value.
 */
type WritableReadable<T> = Readable<T> & Writable<T>;

/**
 * Writable readable value with untracked read.
 */
type WritableReadable<T> = WritableReadable<T>;

/**
 * Signal.
 *
 * Writable, readable,  reactive value.
 */
type Signal<T> = Accessor<T> & Writable<T>;

/**
 * Cached derived value.
 */
type Computed<T> = Readable<T>;

/**
 * Memoized derived value.
 */
type Memo<T> = Readable<T>;

/**
 * Generic derived readable value.
 */
type Derived<T> = Readable<T>;

/**
 * Effect handle.
 *
 * Callable as a tracked read if the effect exposes a value,
 * callable as dispose handle to stop the effect.
 */
type Effect<T = void> = Readable<T> & Disposable & Partial<SymbolDisposable>;

/**
 * Scan handle.
 */
type Scan<T> = Readable<T> & Disposable & Partial<SymbolDisposable>;

/**
 * Push-based realtime source.
 */
type Realtime<T> = WritableReadable<T> & {
  subscribe(cb: () => void): () => void;
};

/**
 * Async iterable stream source.
 */
type Stream<T> = WritableReadable<T> & AsyncIterable<T>;

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
 * Extract value type from a reactive value-like shape.
 */
type ValueOf<T> =
  T extends Accessor<infer V>
    ? V
    : T extends ValueReadable<infer V>
      ? V
      : never;
