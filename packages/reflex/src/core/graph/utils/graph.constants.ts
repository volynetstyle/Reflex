import { type BitMask } from "../../object/utils/bitwise.js";

const CLEAN: BitMask = 0;
const CHECK = 1 << 0;
const DIRTY: BitMask = 1 << 1;
const DISPOSED: BitMask = 1 << 2;
const DISPOSING: BitMask = 1 << 3;
const SCHEDULED: BitMask = 1 << 4;
const RUNNING: BitMask = 1 << 5;
const ASYNC: BitMask = 1 << 6;
const KIND_SOURCE: BitMask = 1 << 7;
const KIND_COMPUTATION: BitMask = 1 << 8;
const KIND_EFFECT: BitMask = 1 << 9;

/**
 * Number of cells in the internal Uint32Array structures.
 *
 * - COUNTER_CELLS: [epoch, version, uversion]
 */
const COUNTER_CELLS = {
  epoch: 0,
  version: 1,
  uversion: 2,
} as const;

const COUNTER_CELLS_LENGTH = 3;

/**
 * Number of cells in the async tracking Uint32Array structure.
 *
 * - ASYNC_CELLS: [generation, token]
 */
const ASYNC_CELLS = {
  generation: 0,
  token: 1,
} as const;

const ASYNC_CELLS_LENGTH = 2;

export {
  COUNTER_CELLS,
  ASYNC_CELLS,
  COUNTER_CELLS_LENGTH,
  ASYNC_CELLS_LENGTH,
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
