import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { observationsEqual, type Observation, type Value } from "./harness";

/**
 * Properties of the arbiter. Every spec verdict, metamorphic relation and
 * spec-mutant kill is a call of `observationsEqual`; a comparator that is not
 * an equivalence relation, or that ignores a field, makes all of them report
 * agreement they did not establish.
 */

const values: readonly Value[] = [
  -Infinity,
  -1,
  -0,
  0,
  1,
  Infinity,
  NaN,
  false,
  true,
  null,
  "",
  "0",
];
const value = fc.constantFrom(...values);
const error = fc.record({
  name: fc.constantFrom("Error", "TypeError", "ThrownValue"),
  message: fc.constantFrom("", "X", "Y"),
});
const effect = fc.record({
  effect: fc.constantFrom("a", "b"),
  phase: fc.constantFrom("run" as const, "cleanup" as const),
  value,
});
// `error: undefined` is not produced by RuntimeMachine, but the comparator is
// exported and must not depend on that.
const observation: fc.Arbitrary<Observation> = fc
  .record(
    {
      value,
      error: fc.option(error, { nil: undefined, freq: 4 }),
      effects: fc.array(effect, { maxLength: 3 }),
    },
    { requiredKeys: ["effects"] },
  )
  .map((item) => item as Observation);

/**
 * The type forbids an explicitly undefined field (exactOptionalPropertyTypes);
 * spreads and JavaScript callers do not, so the properties cover it.
 */
type Loose = { -readonly [K in keyof Observation]?: unknown };

/** A copy that keeps key presence, -0 and NaN. */
function clone(item: Observation): Observation {
  const copy: Observation = { effects: item.effects.map((e) => ({ ...e })) };
  if ("value" in item) copy.value = item.value;
  if ("error" in item)
    (copy as Loose).error =
      item.error === undefined ? undefined : { ...item.error };
  return copy;
}

/** A value different from `item` under Object.is. */
const otherValue = (item: Value | undefined): Value =>
  values.find((candidate) => !Object.is(candidate, item))!;

type Perturbation = { field: string; apply(item: Observation): Observation };

/** Every single-field change the comparator must distinguish. */
function perturbations(item: Observation): Perturbation[] {
  const result: Perturbation[] = [
    {
      field: "value presence",
      apply(source) {
        const next = clone(source);
        if ("value" in next) delete next.value;
        else next.value = 0;
        return next;
      },
    },
    {
      field: "error presence",
      apply(source) {
        const next = clone(source);
        if ("error" in next) delete next.error;
        else next.error = { name: "Error", message: "X" };
        return next;
      },
    },
    {
      field: "effects length",
      apply(source) {
        const next = clone(source);
        next.effects.push({ effect: "a", phase: "run", value: 0 });
        return next;
      },
    },
  ];
  if ("value" in item)
    result.push({
      field: "value",
      apply(source) {
        const next = clone(source);
        next.value = otherValue(source.value);
        return next;
      },
    });
  if ("error" in item && item.error === undefined)
    result.push({
      field: "error value",
      apply(source) {
        const next = clone(source);
        next.error = { name: "Error", message: "X" };
        return next;
      },
    });
  if (item.error !== undefined) {
    result.push(
      {
        field: "error.name",
        apply(source) {
          const next = clone(source);
          next.error!.name += "'";
          return next;
        },
      },
      {
        field: "error.message",
        apply(source) {
          const next = clone(source);
          next.error!.message += "'";
          return next;
        },
      },
    );
  }
  item.effects.forEach((_, index) => {
    result.push(
      {
        field: `effects[${index}].effect`,
        apply(source) {
          const next = clone(source);
          next.effects[index]!.effect += "'";
          return next;
        },
      },
      {
        field: `effects[${index}].phase`,
        apply(source) {
          const next = clone(source);
          const event = next.effects[index]!;
          event.phase = event.phase === "run" ? "cleanup" : "run";
          return next;
        },
      },
      {
        field: `effects[${index}].value`,
        apply(source) {
          const next = clone(source);
          const event = next.effects[index]!;
          event.value = otherValue(event.value);
          return next;
        },
      },
    );
  });
  return result;
}

/** A pair that is equal about half of the time. */
const related = observation.chain((item) =>
  fc.nat({ max: perturbations(item).length * 2 - 1 }).map((index) => {
    const choices = perturbations(item);
    return [
      item,
      index < choices.length ? choices[index]!.apply(item) : clone(item),
    ] as const;
  }),
);

describe("observation comparator", () => {
  it("is reflexive", () => {
    fc.assert(
      fc.property(observation, (item) => {
        expect(observationsEqual(item, item)).toBe(true);
        expect(observationsEqual(item, clone(item))).toBe(true);
      }),
    );
  });

  it("is symmetric", () => {
    fc.assert(
      fc.property(related, ([left, right]) => {
        expect(observationsEqual(left, right)).toBe(
          observationsEqual(right, left),
        );
      }),
    );
  });

  it("is transitive", () => {
    const triple = related.chain(([left, middle]) =>
      fc
        .boolean()
        .map(
          (same) =>
            [
              left,
              middle,
              same ? clone(middle) : perturbations(middle)[0]!.apply(middle),
            ] as const,
        ),
    );
    fc.assert(
      fc.property(triple, ([a, b, c]) => {
        if (observationsEqual(a, b) && observationsEqual(b, c))
          expect(observationsEqual(a, c)).toBe(true);
      }),
    );
  });

  it("distinguishes a change of every observed field, in both directions", () => {
    fc.assert(
      fc.property(observation, (item) => {
        for (const { field, apply } of perturbations(item)) {
          const changed = apply(item);
          expect(observationsEqual(item, changed), field).toBe(false);
          expect(observationsEqual(changed, item), field).toBe(false);
        }
      }),
    );
  });

  it("does not take an explicitly undefined error for agreement (regression)", () => {
    // Before the fix, the error check read only the left side.
    const quiet = { error: undefined, effects: [] } as Loose as Observation;
    const failed: Observation = {
      error: { name: "Error", message: "X" },
      effects: [],
    };
    expect(observationsEqual(quiet, failed)).toBe(false);
    expect(observationsEqual(failed, quiet)).toBe(false);
  });
});
