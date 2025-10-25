/**
 * Represents a minimal unified contract for asynchronous values,
 * compatible with both native Promises and custom reactive runtimes.
 *
 * A `Thenable<T>` behaves like a Promise but may also expose internal state
 * for inspection or integration with reactive graphs.
 *
 * This interface allows `await` compatibility without forcing the value
 * to be a native Promise, enabling fine-grained async reactivity.
 *
 * @template T Type of the resolved value.
 */
interface Thenable<T> {
  /**
   * Attaches callbacks for the resolution or rejection of the asynchronous value.
   *
   * The callbacks can return either a plain value or another `Async`
   * (which includes native Promises and custom Thenables).
   * This preserves the full "Promise resolution" semantics while allowing
   * runtime extensions (e.g. lazy evaluation or reactive propagation).
   *
   * @typeParam TResult1 - Type returned on successful resolution.
   * @typeParam TResult2 - Type returned on rejection.
   *
   * @param onfulfilled Callback invoked when the computation resolves successfully.
   * May return a value or another Async computation.
   *
   * @param onrejected Callback invoked when the computation is rejected.
   * May return a recovery value or another Async computation.
   *
   * @returns A new `Thenable` representing the continuation of the chain.
   */
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | Async<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | Async<TResult2>) | null
  ): Thenable<TResult1 | TResult2>;

  /**
   * Optional runtime state indicator for reactive or diagnostic purposes.
   * Not part of the standard PromiseLike contract, but useful for
   * observing internal progress without attaching callbacks.
   *
   * - `"pending"`   → The computation has not yet settled.
   * - `"fulfilled"` → The computation completed successfully.
   * - `"rejected"`  → The computation failed.
   */
  readonly state?: "pending" | "fulfilled" | "rejected";

  /**
   * The resolved value of the computation (if available).
   * Typically undefined until `state` becomes `"fulfilled"`.
   */
  readonly value?: T;

  /**
   * The reason of failure, if `state` is `"rejected"`.
   */
  readonly reason?: unknown;
}

/**
 * Unified alias for any asynchronous computation,
 * whether native (`Promise<T>`) or user-defined (`Thenable<T>`).
 *
 * Can be used in APIs to accept both native Promises
 * and extended asynchronous abstractions transparently.
 */
type Async<T> = Promise<T> | Thenable<T>;
