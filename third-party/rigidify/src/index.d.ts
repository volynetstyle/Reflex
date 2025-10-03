declare const __DEV__: boolean

/**
 * A path in the state tree.
 * Each element can be a string (object key) or a number (array index).
 */
export type Path = Array<string | number>;

/**
 * A single update operation: set a value at a given path.
 */
export interface Update<T> {
  path: Path;
  value: unknown;
}

/**
 * Backend interface — abstraction for different implementations
 * (naive object copying, matrix-sharded buffer, etc.).
 */
export interface Backend<TState> {
  /**
   * Get the value at a given path in the state.
   */
  get(state: TState, path: Path): unknown;

  /**
   * Set a value at a given path, producing a new immutable state.
   */
  set(state: TState, path: Path, value: unknown): TState;

  /**
   * Apply multiple updates in a single batch, producing a new immutable state.
   */
  batch(state: TState, updates: Array<Update<unknown>>): TState;

  /**
   * Convert internal state representation into a plain JS object.
   */
  toPlainObject(state: TState): object;
}

/**
 * Snapshot wrapper — represents an immutable state value.
 */
export interface StateSnapshot<T> {
  readonly state: T;
}

/**
 * Create a new snapshot with the given initial state.
 */
export function create<T>(initial: T): StateSnapshot<T>;

/**
 * Get a value from a snapshot by path.
 */
export function get<T, R>(snap: StateSnapshot<T>, path: Path): R | undefined;

/**
 * Set a value in a snapshot by path.
 * Returns a new snapshot with the updated state.
 */
export function set<T, R>(
  snap: StateSnapshot<T>,
  path: Path,
  value: R
): StateSnapshot<T>;

/**
 * @unsupported
 * Apply a functional update to a snapshot.
 * Useful for DSLs and producer-like patterns (similar to Immer).
 *
 * Example:
 * ```ts
 * const next = set(snap, draft => {
 *   draft.user.name = "Bob";
 * });
 * ```
 */
export function set<T>(
  snap: StateSnapshot<T>,
  producer: (draft: T) => T
): StateSnapshot<T>;

/**
 * Apply multiple updates in a single step.
 * Returns a new snapshot with all updates applied.
 */
export function batch<T>(
  snap: StateSnapshot<T>,
  updates: Array<Update<unknown>>
): StateSnapshot<T>;

/**
 * Convert a snapshot into a plain JS object.
 */
export function toPlainObject<T extends object>(snap: StateSnapshot<T>): T;
