import { CausalCoords } from "./coords";

const isTimeMonotonic = (target: CausalCoords, sub: CausalCoords): boolean =>
  1 + target.t === sub.t;

const isPhaseNew = (target: CausalCoords, sub: CausalCoords): boolean =>
  target.p < sub.p;
