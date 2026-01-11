// Lattice implementations
export { latticeMaxNumber, latticeMinNumber, latticeMaxBigInt } from "./lattice"
export { latticeSetUnion, latticeSetIntersection } from "./lattice"
export { latticeTupleAppend, latticeArrayConcat } from "./lattice"

// Coordinate operations
export {
  createCoords,
  COORDS_ZERO,
  COORDS_INFINITY,
  coordsDominate,
  coordsEqual,
  coordsJoin,
  coordsMeet,
  coordsPoset,
  coordsLattice,
} from "./coords"

// JoinFrame factory
export { createJoin } from "./joinframe"
export type { JoinFrame } from "./joinframe"
