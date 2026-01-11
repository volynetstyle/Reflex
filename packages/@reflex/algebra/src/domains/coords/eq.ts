import type { Eq } from "../../core/sets/eq";
import type { Coords } from "./coords";

export const CoordsEq: Eq<Coords> = {
  equals: (a, b) => a.t === b.t && a.v === b.v && a.p === b.p && a.s === b.s,
};
