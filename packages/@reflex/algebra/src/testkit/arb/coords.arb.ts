import type { Coords } from "../../domains/coords/coords"

/**
 * coordsArb
 *
 * Generator for random Coords values (for property-based testing).
 * Generates coordinates with reasonable bounds.
 */
export function coordsArb(minValue = 0, maxValue = 100): () => Coords {
  return () => ({
    t: Math.floor(Math.random() * (maxValue - minValue + 1)) + minValue,
    v: Math.floor(Math.random() * (maxValue - minValue + 1)) + minValue,
    p: Math.floor(Math.random() * (maxValue - minValue + 1)) + minValue,
    s: Math.floor(Math.random() * (maxValue - minValue + 1)) + minValue,
  })
}

/**
 * coordsArbSmall
 *
 * Generator for small Coords values.
 */
export function coordsArbSmall(): () => Coords {
  return coordsArb(0, 10)
}

/**
 * coordsArbLarge
 *
 * Generator for large Coords values.
 */
export function coordsArbLarge(): () => Coords {
  return coordsArb(100, 1000)
}
