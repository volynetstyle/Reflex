import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  createRuntime,
  effect,
  signal,
} from "../../reflex/tests/reflex.test_utils";
import {
  collectStore,
  createReactiveMap,
  createSelector,
  createStoreProjection,
  disposeStore,
  snapshot,
  transaction,
} from "../src/advanced";

const modes = ["flush", "eager", "sab"] as const;
const operation = fc.record({
  kind: fc.constantFrom("set", "delete", "clear", "batch"),
  key: fc.integer({ min: 0, max: 7 }),
  value: fc.oneof(
    fc.integer({ min: -10, max: 10 }),
    fc.constant(undefined),
    fc.constant(NaN),
    fc.constant(-0),
  ),
});

describe.each(modes)("native Map differential (%s)", (effectStrategy) => {
  it("matches native values, membership, insertion order, snapshots and key observer traces", () => {
    fc.assert(
      fc.property(
        fc.array(operation, { minLength: 1, maxLength: 100 }),
        (operations) => {
          const rt = createRuntime({ effectStrategy });
          const map = createReactiveMap<number, number | undefined>();
          const reference = new Map<number, number | undefined>();
          const values: Array<Array<number | undefined>> = Array.from(
            { length: 8 },
            () => [],
          );
          const membership: boolean[][] = Array.from({ length: 8 }, () => []);
          const expectedValues = values.map(
            () => [undefined] as Array<number | undefined>,
          );
          const expectedMembership = membership.map(() => [false]);
          const stops = values.flatMap((seen, key) => [
            effect(() => {
              seen.push(map.get(key));
            }),
            effect(() => {
              membership[key]!.push(map.has(key));
            }),
          ]);
          let keys: number[] = [],
            entries: Array<[number, number | undefined]> = [];
          stops.push(
            effect(() => {
              keys = [...map.keys()];
            }),
            effect(() => {
              entries = [...map];
            }),
          );
          try {
            for (const op of operations) {
              const before = new Map(reference);
              transaction(() => {
                if (op.kind === "set" || op.kind === "batch") {
                  map.set(op.key, op.value);
                  reference.set(op.key, op.value);
                  if (op.kind === "batch") {
                    const other = (op.key + 1) % 8;
                    map.set(other, op.value);
                    reference.set(other, op.value);
                  }
                } else if (op.kind === "delete") {
                  expect(map.delete(op.key)).toBe(reference.delete(op.key));
                } else {
                  map.clear();
                  reference.clear();
                }
              });
              // Reads are current regardless of effect delivery policy.
              expect([...map]).toEqual([...reference]);
              rt.flush();
              for (let key = 0; key < 8; key++) {
                if (!Object.is(before.get(key), reference.get(key)))
                  expectedValues[key]!.push(reference.get(key));
                if (before.has(key) !== reference.has(key))
                  expectedMembership[key]!.push(reference.has(key));
              }
              expect(values).toEqual(expectedValues);
              expect(membership).toEqual(expectedMembership);
              expect(keys).toEqual([...reference.keys()]);
              expect(entries).toEqual([...reference]);
              expect(map.size).toBe(reference.size);
              expect([...snapshot(map)]).toEqual([...reference]);
              map.collect(); // Live observations must survive collection.
            }
          } finally {
            stops.forEach((stop) => stop());
            map.collect();
            map.dispose();
          }
        },
      ),
      { seed: 10071026, numRuns: 150 },
    );
  });
});

describe.each(modes)("projection differential (%s)", (effectStrategy) => {
  it("matches from-scratch object/array derivation and leaf/existence/key traces", () => {
    const action = fc.record({
      kind: fc.constantFrom(
        "left",
        "right",
        "mode",
        "name",
        "age",
        "add",
        "remove",
        "item",
      ),
      value: fc.integer({ min: 0, max: 9 }),
    });
    fc.assert(
      fc.property(
        fc.array(action, { minLength: 1, maxLength: 80 }),
        (actions) => {
          const rt = createRuntime({ effectStrategy });
          const left = signal(0),
            right = signal(0),
            mode = signal(false);
          const person = signal({ name: "Ada", age: 28 });
          const dictionary = signal<Record<string, number>>({});
          const items = signal([0, 1]);
          const derive = () => ({
            user: person(),
            selected: mode() ? right() : left(),
            dictionary: dictionary(),
            items: items(),
          });
          const store = createStoreProjection(derive, derive());
          const actual: unknown[][] = [[], [], [], [], []];
          const oracle = () => [
            person().name,
            mode() ? right() : left(),
            "x" in dictionary(),
            JSON.stringify(Object.keys(dictionary())),
            JSON.stringify(items()),
          ];
          const expected = oracle().map((value) => [value]);
          const stops = [
            effect(() => {
              actual[0]!.push(store.user.name);
            }),
            effect(() => {
              actual[1]!.push(store.selected);
            }),
            effect(() => {
              actual[2]!.push("x" in store.dictionary);
            }),
            effect(() => {
              actual[3]!.push(JSON.stringify(Object.keys(store.dictionary)));
            }),
            effect(() => {
              actual[4]!.push(JSON.stringify([...store.items]));
            }),
          ];
          try {
            for (const action of actions) {
              const before = oracle();
              switch (action.kind) {
                case "left":
                  left.set(action.value);
                  break;
                case "right":
                  right.set(action.value);
                  break;
                case "mode":
                  mode.set(Boolean(action.value % 2));
                  break;
                case "name":
                  person.set({ ...person(), name: String(action.value) });
                  break;
                case "age":
                  person.set({ ...person(), age: action.value });
                  break;
                case "add":
                  dictionary.set({ ...dictionary(), x: action.value });
                  break;
                case "remove":
                  dictionary.set({});
                  break;
                case "item":
                  items.set([action.value, 1]);
                  break;
              }
              rt.flush();
              const after = oracle();
              after.forEach((value, index) => {
                if (!Object.is(value, before[index]))
                  expected[index]!.push(value);
              });
              expect(actual).toEqual(expected);
              expect(snapshot(store)).toEqual(derive());
              collectStore(store);
            }
          } finally {
            stops.forEach((stop) => stop());
            collectStore(store);
            disposeStore(store);
          }
        },
      ),
      { seed: 70102026, numRuns: 100 },
    );
  });

  it("routes selector transitions with exact per-key observer traces", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1, max: 7 }), {
          minLength: 1,
          maxLength: 100,
        }),
        (keys) => {
          const rt = createRuntime({ effectStrategy });
          const source = signal(-1);
          const selected = createSelector(source);
          const actual: boolean[][] = Array.from({ length: 8 }, () => []);
          const expected = actual.map(() => [false]);
          const stops = actual.map((values, key) =>
            effect(() => {
              values.push(selected(key));
            }),
          );
          let before = -1;
          try {
            for (const next of keys) {
              source.set(next);
              rt.flush();
              for (let key = 0; key < 8; key++) {
                if ((before === key) !== (next === key))
                  expected[key]!.push(next === key);
              }
              expect(actual).toEqual(expected);
              before = next;
            }
          } finally {
            stops.forEach((stop) => stop());
            selected.collect();
            selected.dispose();
          }
        },
      ),
      { seed: 10202607, numRuns: 100 },
    );
  });
});
