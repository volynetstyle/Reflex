import { describe, it } from "vitest";
import { checkLaws } from "../../src/testkit/laws/checkLaws";
import { posetLaws } from "../../src/typelevel/laws/order.laws";

import { CoordsDominance } from "../../src/domains/coords/order";
import { CoordsEq } from "../../src/domains/coords/eq";
import type { Coords } from "../../src/domains/coords/coords";

function sampleCoords(): Coords {
  const rnd = () => (Math.random() * 10) | 0;
  return { t: rnd(), v: rnd(), p: rnd(), s: rnd() };
}

describe("coords dominance order", () => {
  it("satisfies poset laws", () => {
    checkLaws(posetLaws(CoordsDominance, CoordsEq.equals, sampleCoords), 500);
  });
});
