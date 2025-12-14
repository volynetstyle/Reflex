
const CLEAN = 0;
const CHECK = 1 << 0;
const DIRTY = 1 << 1;
const DISPOSED = 1 << 2;
const DISPOSING = 1 << 3;
const SCHEDULED = 1 << 4;
const RUNNING = 1 << 5;
const ASYNC = 1 << 6;
const KIND_SOURCE = 1 << 7;
const KIND_COMPUTATION = 1 << 8;
const KIND_EFFECT = 1 << 9;

/**
 * Number of cells in the internal Uint32Array structures.
 *
 * - COUNTER_CELLS: [epoch, version, uversion]
 */
const COUNTER_CELLS = {
  epoch: 0,
  version: 1,
  uversion: 2,
  // async
  generation: 3,
  token: 4,
} as const;

const COUNTER_CELLS_LENGTH = 5;

export {
  COUNTER_CELLS,
  COUNTER_CELLS_LENGTH,
  CLEAN,
  DIRTY,
  DISPOSED,
  SCHEDULED,
  RUNNING,
  ASYNC,
  KIND_SOURCE,
  KIND_COMPUTATION,
  KIND_EFFECT,
};
