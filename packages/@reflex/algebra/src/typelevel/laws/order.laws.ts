import type { Preorder, Poset } from "../../core/sets/order";
import type { LawSet } from "../../core/laws/laws";

export function preorderLaws<T>(P: Preorder<T>, sample: () => T): LawSet {
  return [
    {
      name: "preorder/reflexive",
      check: () => {
        const a = sample();
        return P.leq(a, a);
      },
    },
    {
      name: "preorder/transitive",
      check: () => {
        const a = sample();
        const b = sample();
        const c = sample();
        return !(P.leq(a, b) && P.leq(b, c)) || P.leq(a, c);
      },
    },
  ] as const;
}

export function posetLaws<T>(
  O: Poset<T>,
  eq: (a: T, b: T) => boolean,
  sample: () => T,
): LawSet {
  return [
    ...preorderLaws(O, sample),
    {
      name: "poset/antisymmetric",
      check: () => {
        const a = sample();
        const b = sample();
        return !(O.leq(a, b) && O.leq(b, a)) || eq(a, b);
      },
    },
  ] as const;
}
