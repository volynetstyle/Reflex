import { types as t } from "@babel/core";
import type { StaticHole } from "./model";

/** Parameters of a create function with holes: `(d, hole, h)`. */
export const HOLE_PARAMS = {
  doc: () => t.identifier("d"),
  mount: () => t.identifier("hole"),
  values: () => t.identifier("h"),
};

export interface HoleSite {
  readonly hole: StaticHole;
  readonly parent: t.Expression;
  readonly marker: t.Expression;
}

/** `if (!accepts(h)) return null;`: decided before any node exists. */
export function holeGuard(accepts: t.Identifier): t.Statement {
  return t.ifStatement(
    t.unaryExpression("!", t.callExpression(accepts, [HOLE_PARAMS.values()])),
    t.returnStatement(t.nullLiteral()),
  );
}

/** `hole(parent, marker, h[i], scalar)` per hole, in document order. */
export function mountHoles(sites: readonly HoleSite[]): t.Statement[] {
  return [...sites]
    .sort((a, b) => a.hole.index - b.hole.index)
    .map(({ hole, parent, marker }) =>
      t.expressionStatement(
        t.callExpression(HOLE_PARAMS.mount(), [
          parent,
          marker,
          t.memberExpression(HOLE_PARAMS.values(), t.numericLiteral(hole.index), true),
          t.booleanLiteral(hole.scalar),
        ]),
      ),
    );
}
