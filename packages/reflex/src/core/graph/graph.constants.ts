
import { type BitMask } from "../object/utils/bitwise.js";

const CLEAN: BitMask = 0;
const DIRTY: BitMask = 1 << 0;
const DISPOSED: BitMask = 1 << 1;
const SCHEDULED: BitMask = 1 << 2;
const RUNNING: BitMask = 1 << 3;
const ASYNC: BitMask = 1 << 4;
const KIND_SOURCE: BitMask = 1 << 5;
const KIND_COMPUTATION: BitMask = 1 << 6;
const KIND_EFFECT: BitMask = 1 << 7;

/**
 * Number of cells in the internal Uint32Array structures.
 * 
 * - COUNTER_CELLS: [epoch, version, uversion]
 */
const COUNTER_CELLS = {
    epoch: 0,
    version: 1,
    uversion: 2,
    length: 3 // automaticaly captures by array constructor
} as const

/**
 * Number of cells in the async tracking Uint32Array structure.
 * 
 * - ASYNC_CELLS: [generation, token]
 */
const ASYNC_CELLS = {
    generation: 0,
    token: 1,
    length: 2
} as const

export {
    COUNTER_CELLS,
    ASYNC_CELLS,

    CLEAN,
    DIRTY,
    DISPOSED,
    SCHEDULED,
    RUNNING,
    ASYNC,

    KIND_SOURCE,
    KIND_COMPUTATION,
    KIND_EFFECT
};