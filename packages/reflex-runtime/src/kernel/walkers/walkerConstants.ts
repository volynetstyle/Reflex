/**
 * Result codes for the pull-phase dependency walkers.
 *
 * `walkLine` uses `BAIL` to hand branching shapes to the full DFS walker
 * without paying the DFS setup cost on narrow dependency chains.
 */
export const CLEAN = 0;
export const DIRTY = 1;
export const BAIL = 2;

