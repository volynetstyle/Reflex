/**
 * A zero-argument reactive reader.
 *
 * In Reflex terms, an Accessor is the read side of a reactive value:
 *
 * ```ts
 * const count: Accessor<number> = () => 1;
 * ```
 *
 * Accessors are intentionally represented as plain functions.
 * This keeps the core runtime independent from any specific signal object shape.
 */
export type Accessor<T> = () => T;

export type SetInput<T> = T | ((previous: T) => T);

export type Setter<T> = (input: SetInput<T>) => void;

export type ReactiveReadable<T> = Accessor<T> & {
  readonly value: T;
};

export type Signal<T> = ReactiveReadable<T>;

/**
 * Unified read/write accessor for a signal.
 *
 * Zero-argument calls read the current value. Single-argument calls write
 * either a literal value or a functional updater derived from the previous
 * value, and return the value that was actually stored.
 *
 * ```ts
 * const count = useSignal(0);
 * count();                            // read
 * count(10);                          // write
 * count((previous) => previous + 1);  // functional update
 * ```
 *
 * Note: to store `undefined` explicitly, use a functional update
 * (`count(() => undefined)`) rather than `count(undefined)` — the latter
 * is indistinguishable from a zero-argument read at the call boundary.
 */
export interface SignalAccessor<T> {
  (): T;
  (input: SetInput<T>): T;
}

export type Computed<T> = ReactiveReadable<T>;

export type Memo<T> = ReactiveReadable<T>;

/**
 * A value that may either be static or reactive.
 *
 * Useful for props and attributes that may accept both:
 *
 * ```ts
 * title: "Hello"
 * title: () => userName()
 * ```
 */
export type MaybeAccessor<T> = T | Accessor<T>;

/**
 * Extracts the inner value from an Accessor-like type.
 *
 * ```ts
 * AccessorValue<Accessor<number>> // number
 * AccessorValue<string>           // string
 * ```
 */
export type AccessorValue<T> = T extends Accessor<infer Value> ? Value : T;

/**
 * A function used to release a resource.
 *
 * Cleanup is callable by design:
 *
 * ```ts
 * const cleanup: Cleanup = () => unsubscribe();
 * cleanup();
 * ```
 *
 * The optional `dispose` method allows compatibility with disposable-style APIs:
 *
 * ```ts
 * cleanup.dispose?.();
 * ```
 */
export type Cleanup = (() => void) & {
  dispose?: () => void;
};

/**
 * A stable identity key used by higher-level renderers.
 *
 * The runtime itself does not interpret keys. They are consumed by renderers,
 * list reconcilers, or host-specific layers.
 */
export type AttributeKey = string | number | bigint;

/**
 * Common attributes available to all JSX renderables.
 *
 * `key` is intentionally not part of component props semantics.
 * It is metadata for the renderer/reconciler.
 */
export interface Attributes {
  /**
   * Optional stable identity hint for reconciliation.
   */
  key?: AttributeKey | null;
}
