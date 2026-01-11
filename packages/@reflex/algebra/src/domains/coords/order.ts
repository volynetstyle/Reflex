import type { Poset } from "../../core/sets/order";
import type { Coords } from "./coords";

/**
 * Dominance order:
 * a ≤ b iff all components a_i ≤ b_i
 */
export const CoordsDominance: Poset<Coords> = {
  leq: (a, b) => a.t <= b.t && a.v <= b.v && a.p <= b.p && a.s <= b.s,
};
