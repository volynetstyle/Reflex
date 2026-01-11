import type { Coords } from "../../domains/coords/coords"

/**
 * createCoords
 *
 * Factory function to create a Coords object.
 */
export function createCoords(
  t: number = 0,
  v: number = 0,
  p: number = 0,
  s: number = 0,
): Coords {
  return { t, v, p, s }
}

/**
 * Zero coordinates
 */
export const COORDS_ZERO = createCoords(0, 0, 0, 0)

/**
 * Infinity coordinates (useful for lattice bounds)
 */
export const COORDS_INFINITY = createCoords(
  Infinity,
  Infinity,
  Infinity,
  Infinity,
)
