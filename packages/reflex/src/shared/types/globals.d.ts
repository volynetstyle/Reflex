/*
 * Reflex
 */

/**
 * Represents a function that takes no arguments and returns nothing.
 *
 * Commonly used for cleanup callbacks, disposers, unsubscribers,
 * or any "fire and forget" side-effect handlers.
 *
 * Signature:
 * ```ts
 * type NoneToVoidFn = () => void;
 * ```
 *
 * Examples:
 * ```ts
 * const dispose: NoneToVoidFn = () => {
 *   clearTimeout(timerId);
 * };
 *
 * owner.onCleanup(dispose);
 * ```
 *
 * Mnemonic:
 *  - (None) → Void
 *  - No parameters in, nothing out.
 */
type NoneToVoidFn = () => void;
