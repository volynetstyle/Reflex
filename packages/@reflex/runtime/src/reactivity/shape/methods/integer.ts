const JS_DOUBLE_SHIFT = 26;
const JS_DOUBLE_MASK = (1 << JS_DOUBLE_SHIFT) - 1;

export type Int64 = number;

// @__INLINE__
export const pack = (rank: number, original: number): number =>
  (original << JS_DOUBLE_SHIFT) | rank;

// @__INLINE__
export const getRank = (packed: number): number => packed & JS_DOUBLE_MASK;

// @__INLINE__
export const getOriginalRank = (packed: number): number =>
  packed >> JS_DOUBLE_SHIFT;
