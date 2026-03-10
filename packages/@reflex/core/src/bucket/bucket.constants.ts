/**
 * @__INLINE__
 */
export const GROUP_SHIFT = 5;

/**
 * @__INLINE__
 */
export const GROUP_SIZE = 1 << GROUP_SHIFT; // 32

/**
 * @__INLINE__
 */
export const GROUP_MASK = GROUP_SIZE - 1; // 31

/**
 * @__INLINE__
 */
export const MAX_RANKS = 1024;

/**
 * @__INLINE__
 */
export const RANK_MASK = 0x3ff;

/**
 * @__INLINE__
 */
export const INVALID_RANK = -1;

/**
 * @__INLINE__
 */
export const MIN_RANK = 0;

/**
 * @__INLINE__
 */
export const MAX_RANK_VALUE = MAX_RANKS - 1;    