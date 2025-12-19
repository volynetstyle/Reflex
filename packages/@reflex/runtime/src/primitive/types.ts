/**
 * A side-effect callback that reacts to signal changes.
 * Observers are executed when a dependency they track is updated.
 */
export type Observer = () => void;

/**
 * Read-only value accessor.
 *
 * Represents a pure getter function that returns the current value.
 * Has no capability to mutate state.
 */
export type AccessorReadonly<out T> = () => T;

/**
 * Direct value setter.
 *
 * Replaces the current value with the provided one.
 */
export type ValueSetter<in T> = (value: T) => void;

/**
 * Functional update setter.
 *
 * Accepts an updater function that receives the previous value
 * and returns the next value. Useful for atomic or derived updates.
 */
export type UpdateSetter<T> = (updater: (prev: T) => T) => void;

/// start@todo: It may be important to set the rules for using signal semantics through eslint rules for coordination?*

/**
 * Unified setter interface.
 *
 * Combines direct assignment and functional update semantics.
 */
export type Setter<T> = ValueSetter<T> & UpdateSetter<T>;

/**
 * Full accessor (read + write).
 *
 * Callable as a function to read the current value.
 * Exposes a `.value` property for direct access.
 * Provides a `.set` method for updating the value.
 *
 */
export interface Accessor<T> {
  (): T;
  readonly value: T;
  set: Setter<T>;
}

/**
 * Signal pair.
 *
 * A tuple containing a value accessor and its corresponding setter.
 * The accessor is used for reading, the setter for updating.
 */
export type Signal<T> = readonly [crate: Accessor<T>, setValue: Setter<T>];

/// end@todo

/**
 * Pure value transformation.
 *
 * Mental model:
 *  - "value in → value out"
 *  - "creation-time == evaluation-time"
 *
 * Mental test:
 *   - Can be called multiple times with the same input and produce the same output
 *   - The result can be cached forever
 *   - Call order does not matter
 *   - Does not capture time, state, or reactive dependencies
 *
 * Semantics:
 *   - No lifetime
 *   - No ownership
 *   - No side effects
 *   - Referentially transparent
 *
 * Suitable for:
 *   - mapping
 *   - normalization
 *   - structural or mathematical transformations
 */
export type MapFunction<in T, out R = T> = (value: T) => R;

/**
 * Reactive derivation.
 *
 * Mental model:
 *   - "value in → accessor out"
 *   - "creation-time < evaluation-time*"
 *
 * Mental test:
 *   - Result must NOT be cached as a value
 *   - Returned accessor may change its result over time
 *   - Call order may matter
 *   - Captures reactive dependencies or internal state
 *
 * Semantics:
 *   - Introduces lifetime
 *   - Produces a node in the reactive graph
 *   - May outlive the input value
 *   - Evaluation is deferred (lazy)
 *
 * Suitable for:
 *   - computed signals
 *   - memoized reactive projections
 *   - dependency-tracking derivations
 */
export type DeriveFunction<in T, out R = T> = (value: T) => AccessorReadonly<R>;
