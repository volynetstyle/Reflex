export type BitMask = number;

/**
 * Minimalistic bitwise utility for flags and masks.
 * All functions are pure and inlinable.
 */
export const Bitwise = {
  /** @__INLINE__ Checks if all bits in `mask` are set in `flags`. */
  has(flags: BitMask, mask: BitMask): boolean {
    return (flags & mask) === mask;
  },

  /** @__INLINE__ Sets bits from `mask` in `flags`. */
  set(flags: BitMask, mask: BitMask): BitMask {
    return flags | mask;
  },

  /** @__INLINE__ Clears bits from `mask` in `flags`. */
  clear(flags: BitMask, mask: BitMask): BitMask {
    return flags & ~mask;
  },

  /** @__INLINE__ Toggles bits from `mask` in `flags`. */
  toggle(flags: BitMask, mask: BitMask): BitMask {
    return flags ^ mask;
  },

  /** @__INLINE__ Returns true if none of the bits in `mask` are set. */
  none(flags: BitMask, mask: BitMask): boolean {
    return (flags & mask) === 0;
  },

  /** @__INLINE__ Returns true if at least one bit in `mask` is set. */
  any(flags: BitMask, mask: BitMask): boolean {
    return (flags & mask) !== 0;
  },
} as const;
