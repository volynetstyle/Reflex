import type { Coords } from "./coords";

class CoordsFrame implements Coords {
  constructor(
    public readonly t = 0,
    public readonly v = 0,
    public readonly p = 0,
    public readonly s = 0,
  ) {}
}

export { CoordsFrame };
