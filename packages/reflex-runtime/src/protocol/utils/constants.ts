/**
 * Read mode for consumer nodes (computed values).
 *
 * @enum {number}
 *
 * @property {1} lazy - Stabilize and register dependency in active context.
 *   The node is synchronized to reflect upstream changes, and this read is
 *   registered as a dependency of the currently executing computation (if any).
 *   If no computation is active, the read is not tracked.
 *
 * @property {2} eager - Stabilize immediately without dependency registration.
 *   The node is synchronized without the final dependency `trackRead()` step.
 *   Useful for force-refreshing a value without creating a dependency relationship.
 */
export const ConsumerReadMode = {
  lazy: 1 << 0,
  eager: 1 << 1,
} as const;

export type ConsumerReadMode =
  (typeof ConsumerReadMode)[keyof typeof ConsumerReadMode];
