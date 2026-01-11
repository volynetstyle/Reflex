import type { Eq } from "../../core/sets/eq";
import type { LawSet } from "../../core/laws/laws";

export function eqLaws<T>(E: Eq<T>, sample: () => T): LawSet {
  return [
    {
      name: "eq/reflexive",
      check: () => {
        const a = sample();
        return E.equals(a, a);
      },
    },
    {
      name: "eq/symmetric",
      check: () => {
        const a = sample();
        const b = sample();
        return E.equals(a, b) === E.equals(b, a);
      },
    },
    {
      name: "eq/transitive",
      check: () => {
        const a = sample();
        const b = sample();
        const c = sample();
        return !(E.equals(a, b) && E.equals(b, c)) || E.equals(a, c);
      },
    },
  ] as const;
}
