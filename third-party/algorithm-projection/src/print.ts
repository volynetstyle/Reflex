import type { AlgorithmProjection } from "./model.js";
export const printProjection = (
  projection: AlgorithmProjection,
  space = 2,
): string => JSON.stringify(projection, null, space);
