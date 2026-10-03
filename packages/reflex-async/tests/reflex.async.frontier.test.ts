import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Attempt } from "../src/async/attempt";
import {
  EMPTY_FRONTIER,
  FRONTIER_STATE,
  createFreshnessState,
  FrontierBuilder,
  forEachDependency,
  materializeFrontier,
  sameFrontierShape,
  type EvaluationFrontier,
  type FreshnessDependency,
} from "../src/async/frontier";
import { AsyncProtocolError } from "../src/async/errors";

function dependency(id: string): FreshnessDependency & { readonly id: string } {
  return {
    [FRONTIER_STATE]: createFreshnessState(),
    id,
    ensure() {},
    validate() {},
  };
}

describe("async evaluation frontiers", () => {
  it("matches an ordered union oracle across repeated and reentrant DAG walks", () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(fc.nat(255), { maxLength: 12 }), {
          minLength: 1,
          maxLength: 64,
        }),
        (nodes) => {
          const leaves = Array.from({ length: 8 }, (_, i) =>
            Object.freeze(dependency(String(i))),
          );
          const proofs: EvaluationFrontier[] = [EMPTY_FRONTIER, ...leaves];
          const unions: FreshnessDependency[][] = [
            [],
            ...leaves.map((leaf) => [leaf]),
          ];
          for (const entries of nodes) {
            const builder = new FrontierBuilder();
            const expected = new Set<FreshnessDependency>();
            for (const entry of entries) {
              if (entry % 3 === 0) {
                const leaf = leaves[entry % leaves.length]!;
                builder.add(leaf);
                expected.add(leaf);
              } else {
                const index = entry % proofs.length;
                builder.merge(proofs[index]!);
                for (const leaf of unions[index]!) expected.add(leaf);
              }
            }
            const proof = builder.snapshot();
            const union = [...expected];
            proofs.push(proof);
            unions.push(union);
            expect(materializeFrontier(proof)).toEqual(union);
            const visited: FreshnessDependency[] = [];
            forEachDependency(proof, (leaf) => {
              visited.push(leaf);
              if (leaf !== union[0]) return;
              expect(materializeFrontier(proof)).toEqual(union);
              // Early searches and failed callbacks must preserve outer marks.
              expect(() => new FrontierBuilder(leaf).merge(proof)).toThrow(
                AsyncProtocolError,
              );
              expect(() =>
                forEachDependency(proof, () => {
                  throw new Error("nested failure");
                }),
              ).toThrow("nested failure");
            });
            expect(visited).toEqual(union);
            expect(materializeFrontier(proof)).toEqual(union);
            for (const leaf of leaves) {
              const merge = () => new FrontierBuilder(leaf).merge(proof);
              if (expected.has(leaf)) expect(merge).toThrow(AsyncProtocolError);
              else expect(merge).not.toThrow();
            }
          }
        },
      ),
      { seed: 0x46524f4e, numRuns: 100 },
    );
  });

  it("returns independent publication vectors for direct and composite proofs", () => {
    const a = dependency("a");
    const b = dependency("b");
    const builder = new FrontierBuilder();
    builder.add(a);
    builder.add(b);
    const direct = builder.snapshot();
    builder.merge(direct);
    for (const proof of [direct, builder.snapshot()]) {
      const first = materializeFrontier(proof) as FreshnessDependency[];
      first[0] = b;
      first.pop();
      expect(materializeFrontier(proof)).toEqual([a, b]);
      const visited: FreshnessDependency[] = [];
      forEachDependency(proof, (leaf) => visited.push(leaf));
      expect(visited).toEqual([a, b]);
    }
  });

  it("uses empty and singleton specializations and copies snapshots", () => {
    const first = dependency("first");
    const second = dependency("second");
    const builder = new FrontierBuilder();

    expect(builder.snapshot()).toBe(EMPTY_FRONTIER);
    builder.add(first);
    const singleton = builder.snapshot();
    expect(singleton).toBe(first);

    builder.add(second);
    expect(materializeFrontier(singleton)).toEqual([first]);
    expect(materializeFrontier(builder.snapshot())).toEqual([first, second]);
  });

  it("shares inherited frontiers and materializes distinct dependencies in capture order", () => {
    const a = dependency("a");
    const b = dependency("b");
    const x = dependency("x");
    const y = dependency("y");
    const z = dependency("z");

    const sharedBuilder = new FrontierBuilder();
    sharedBuilder.add(a);
    sharedBuilder.add(b);
    const shared = sharedBuilder.snapshot();

    const leftBuilder = new FrontierBuilder();
    leftBuilder.add(x);
    leftBuilder.merge(shared);
    const left = leftBuilder.snapshot();

    const rightBuilder = new FrontierBuilder();
    rightBuilder.merge(shared);
    rightBuilder.add(y);
    const right = rightBuilder.snapshot();

    const rootBuilder = new FrontierBuilder();
    rootBuilder.merge(left);
    rootBuilder.merge(right);
    rootBuilder.add(z);
    const root = rootBuilder.snapshot();
    const publication = materializeFrontier(root);

    expect(publication).toEqual([x, a, b, y, z]);
    const repeated = materializeFrontier(root);
    expect(repeated).toEqual(publication);
    expect(repeated).not.toBe(publication);
    const pulled: FreshnessDependency[] = [];
    forEachDependency(root, (item) => pulled.push(item));
    expect(pulled).toEqual(publication);
    expect(materializeFrontier(root)).toEqual(publication);
  });

  it("keeps direct reads between inherited proofs in capture order", () => {
    const a = dependency("a");
    const b = dependency("b");
    const c = dependency("c");
    const x = dependency("x");
    const y = dependency("y");
    const z = dependency("z");
    const first = new FrontierBuilder();
    first.add(a);
    first.add(b);
    const second = new FrontierBuilder();
    second.add(b);
    second.add(c);
    const builder = new FrontierBuilder();
    builder.add(x);
    builder.merge(first.snapshot());
    builder.add(y);
    const earlier = builder.snapshot();
    builder.merge(second.snapshot());
    builder.add(z);

    expect(materializeFrontier(earlier)).toEqual([x, a, b, y]);
    expect(materializeFrontier(builder.snapshot())).toEqual([x, a, b, y, c, z]);
  });

  it("treats dependencies with frontier-like properties as leaves in every traversal", () => {
    const owner = {
      ...dependency("owner"),
      kind: "composite",
      bits: 4,
      entries: [dependency("unrelated")],
    };
    const other = {
      ...dependency("other"),
      kind: "direct",
      bits: 2,
      entries: [],
    };
    const child = new FrontierBuilder();
    child.add(other);
    child.add(owner);
    const frontier = child.snapshot();
    expect(materializeFrontier(frontier)).toEqual([other, owner]);
    expect(materializeFrontier(owner)).toEqual([owner]);
    const pulled: FreshnessDependency[] = [];
    forEachDependency(frontier, (item) => pulled.push(item));
    expect(pulled).toEqual([other, owner]);
    expect(() => new FrontierBuilder(owner).merge(frontier)).toThrow(
      AsyncProtocolError,
    );
    expect(sameFrontierShape(owner, other)).toBe(false);
  });

  it("compares only local shape and conservatively rejects different proofs of the same leaves", () => {
    const a = dependency("a");
    const b = dependency("b");
    const direct = () => {
      const builder = new FrontierBuilder();
      builder.add(a);
      builder.add(b);
      return builder.snapshot();
    };
    const shared = direct();
    expect(sameFrontierShape(EMPTY_FRONTIER, EMPTY_FRONTIER)).toBe(true);
    expect(sameFrontierShape(a, a)).toBe(true);
    expect(sameFrontierShape(shared, direct())).toBe(true);
    const composite = (child = shared) => {
      const builder = new FrontierBuilder();
      builder.merge(child);
      builder.add(a);
      return builder.snapshot();
    };
    const first = composite();
    expect(sameFrontierShape(first, composite())).toBe(true);
    expect(sameFrontierShape(first, composite(direct()))).toBe(false);
    expect(sameFrontierShape(shared, first)).toBe(false);
    expect(materializeFrontier(shared)).toEqual(materializeFrontier(first));
    const reversed = new FrontierBuilder();
    reversed.add(b);
    reversed.add(a);
    expect(sameFrontierShape(shared, reversed.snapshot())).toBe(false);
  });

  it("rejects owner cycles hidden in inherited frontiers", () => {
    const owner = dependency("owner");
    const other = dependency("other");
    const ownerFrontier = new FrontierBuilder();
    ownerFrontier.add(owner);
    const child = new FrontierBuilder();
    child.add(other);
    child.merge(ownerFrontier.snapshot());

    const parent = new FrontierBuilder(owner);
    expect(() => parent.merge(child.snapshot())).toThrow(AsyncProtocolError);
  });

  it("checks exact membership inside ID ranges and preserves bounds of older snapshots", () => {
    const before = dependency("before");
    const low = dependency("low");
    const gap = dependency("gap");
    const high = dependency("high");
    const after = dependency("after");
    const child = new FrontierBuilder();
    child.add(high);
    child.add(low);
    const direct = child.snapshot();
    const parent = new FrontierBuilder();
    parent.merge(direct);
    parent.add(high);
    const composite = parent.snapshot();

    for (const proof of [direct, composite]) {
      for (const absent of [before, gap, after]) {
        const builder = new FrontierBuilder(absent);
        builder.merge(proof);
        expect(builder.snapshot()).toBe(proof);
      }
      for (const present of [low, high]) {
        expect(() => new FrontierBuilder(present).merge(proof)).toThrow(
          AsyncProtocolError,
        );
      }
    }

    // Grow in both ID directions after publication. Older proof ranges and
    // obligations must remain valid, including when a later merge is rejected.
    child.add(after);
    child.add(before);
    const grown = child.snapshot();
    const ownerBuilder = new FrontierBuilder(after);
    ownerBuilder.merge(composite);
    expect(() => ownerBuilder.merge(grown)).toThrow(AsyncProtocolError);
    expect(ownerBuilder.snapshot()).toBe(composite);
    expect(materializeFrontier(direct)).toEqual([high, low]);
    expect(materializeFrontier(grown)).toEqual([high, low, after, before]);
    expect(() => new FrontierBuilder(before).merge(grown)).toThrow(
      AsyncProtocolError,
    );
  });

  it("deduplicates repeated direct reads after crossing the small-vector threshold", () => {
    const dependencies = Array.from({ length: 32 }, (_, index) =>
      dependency(String(index)),
    );
    const builder = new FrontierBuilder();
    for (const item of dependencies) builder.add(item);
    builder.add(dependencies[0]!);
    builder.add(dependencies[31]!);

    expect(materializeFrontier(builder.snapshot())).toEqual(dependencies);
  });

  it("keeps one frozen node layout across empty, direct and composite proofs", () => {
    const a = dependency("a");
    const b = dependency("b");
    const builder = new FrontierBuilder();
    builder.add(a);
    builder.add(b);
    const direct = builder.snapshot();
    builder.merge(direct);
    const composite = builder.snapshot();

    for (const frontier of [EMPTY_FRONTIER, direct, composite]) {
      expect(Reflect.ownKeys(frontier)).toEqual(
        Reflect.ownKeys(EMPTY_FRONTIER),
      );
      expect(Object.isFrozen(frontier)).toBe(true);
      for (const value of Object.values(frontier))
        if (Array.isArray(value)) expect(Object.isFrozen(value)).toBe(true);
    }
    builder.add(dependency("later"));
    expect(materializeFrontier(direct)).toEqual([a, b]);
    expect(materializeFrontier(composite)).toEqual([a, b]);
  });

  it("keeps nested walks of the same shared proof independent", () => {
    const a = dependency("a");
    const b = dependency("b");
    const c = dependency("c");
    const sharedBuilder = new FrontierBuilder();
    sharedBuilder.add(a);
    sharedBuilder.add(b);
    const shared = sharedBuilder.snapshot();
    const rootBuilder = new FrontierBuilder();
    rootBuilder.merge(shared);
    rootBuilder.add(c);
    rootBuilder.merge(shared);
    const root = rootBuilder.snapshot();
    const equivalentRoot = rootBuilder.snapshot();
    const equivalentSharedBuilder = new FrontierBuilder();
    equivalentSharedBuilder.add(a);
    equivalentSharedBuilder.add(b);
    const equivalentShared = equivalentSharedBuilder.snapshot();
    const calls: string[] = [];

    forEachDependency(root, (item) => {
      calls.push(`outer:${(item as typeof a).id}`);
      if (item !== a) return;
      expect(sameFrontierShape(root, equivalentRoot)).toBe(true);
      expect(sameFrontierShape(shared, equivalentShared)).toBe(true);
      expect(materializeFrontier(root)).toEqual([a, b, c]);
      forEachDependency(root, (inner) =>
        calls.push(`inner:${(inner as typeof a).id}`),
      );
      expect(() => new FrontierBuilder(b).merge(root)).toThrow(
        AsyncProtocolError,
      );
      const unrelated = new FrontierBuilder(dependency("owner"));
      unrelated.merge(root);
      expect(unrelated.snapshot()).toBe(root);
    });

    expect(calls).toEqual([
      "outer:a",
      "inner:a",
      "inner:b",
      "inner:c",
      "outer:b",
      "outer:c",
    ]);
    expect(materializeFrontier(root)).toEqual([a, b, c]);
  });

  it("deduplicates frozen source handles without changing their layout", () => {
    const a = Object.freeze(dependency("a"));
    const b = Object.freeze(dependency("b"));
    const keys = Reflect.ownKeys(a);
    const builder = new FrontierBuilder();
    builder.add(a);
    builder.add(b);
    builder.merge(a);
    builder.merge(b);
    const frontier = builder.snapshot();
    const visited: FreshnessDependency[] = [];
    forEachDependency(frontier, (item) => visited.push(item));
    expect(visited).toEqual([a, b]);
    expect(materializeFrontier(frontier)).toEqual([a, b]);
    expect(Reflect.ownKeys(a)).toEqual(keys);
    expect(Reflect.ownKeys(b)).toEqual(keys);
  });

  it("restores walker state after nested and outer callback failures", () => {
    const dependencies = [dependency("a"), dependency("b"), dependency("c")];
    const builder = new FrontierBuilder();
    for (const item of dependencies) builder.merge(item);
    const frontier = builder.snapshot();
    const failure = new Error("callback failure");
    const visited: FreshnessDependency[] = [];

    forEachDependency(frontier, (item) => {
      visited.push(item);
      expect(() =>
        forEachDependency(frontier, () => {
          throw failure;
        }),
      ).toThrow(failure);
      expect(materializeFrontier(frontier)).toEqual(dependencies);
    });
    expect(visited).toEqual(dependencies);
    expect(() =>
      forEachDependency(frontier, () => {
        throw failure;
      }),
    ).toThrow(failure);
    expect(materializeFrontier(frontier)).toEqual(dependencies);
  });

  it("walks deep shared graphs without recursion and cleans up early searches", () => {
    const a = dependency("a");
    const b = dependency("b");
    const initial = new FrontierBuilder();
    initial.add(a);
    initial.add(b);
    let frontier = initial.snapshot();
    for (let i = 0; i < 20_000; ++i) {
      const builder = new FrontierBuilder();
      builder.merge(frontier);
      builder.merge(frontier);
      frontier = builder.snapshot();
    }

    expect(materializeFrontier(frontier)).toEqual([a, b]);
    expect(() => new FrontierBuilder(b).merge(frontier)).toThrow(
      AsyncProtocolError,
    );
    const visited: FreshnessDependency[] = [];
    forEachDependency(frontier, (item) => visited.push(item));
    expect(visited).toEqual([a, b]);
    const unrelated = new FrontierBuilder(dependency("owner"));
    unrelated.merge(frontier);
    expect(unrelated.snapshot()).toBe(frontier);
  });

  it("preserves wide pending continuations through deeply nested callbacks", () => {
    const dependencies = Array.from({ length: 1024 }, (_, index) =>
      dependency(String(index)),
    );
    const builder = new FrontierBuilder();
    for (const item of dependencies) builder.merge(item);
    const frontier = builder.snapshot();
    const visit = (depth: number): void => {
      const visited: FreshnessDependency[] = [];
      forEachDependency(frontier, (item) => {
        visited.push(item);
        if (item === dependencies[0] && depth > 0) visit(depth - 1);
      });
      expect(visited).toEqual(dependencies);
    };

    visit(12);
    expect(materializeFrontier(frontier)).toEqual(dependencies);
  });
});

describe("attempt publication frontiers", () => {
  it("keeps memoization local to independent attempts sharing one proof", () => {
    const builder = new FrontierBuilder();
    builder.add(dependency("first"));
    const frontier = builder.snapshot();
    const first = new Attempt(1, () => true);
    const second = new Attempt(2, () => true);
    first.frontier = second.frontier = frontier;
    expect(first.cachedPublicationFrontier()).toBeUndefined();
    const publication = first.publicationFrontier();
    expect(first.cachedPublicationFrontier()).toBe(publication);
    expect(second.cachedPublicationFrontier()).toBeUndefined();
    expect(second.publicationFrontier()).toEqual(publication);
    expect(second.publicationFrontier()).not.toBe(publication);
  });

  it("keeps the proof and retry vector stable through reentrant validation", () => {
    const builder = new FrontierBuilder();
    const attempt = new Attempt(1, () => true);
    let nested = false;
    const calls: string[] = [];
    const a = dependency("a");
    const b = dependency("b");
    a.validate = () => {
      calls.push("a");
      if (!nested) {
        nested = true;
        for (const item of attempt.publicationFrontier()) item.validate();
      }
    };
    b.validate = () => calls.push("b");
    builder.add(a);
    builder.add(b);
    attempt.frontier = builder.snapshot();
    const proof = attempt.frontier;
    const publication = attempt.publicationFrontier();
    for (const item of publication) item.validate();
    expect(calls).toEqual(["a", "a", "b", "b"]);
    expect(attempt.frontier).toBe(proof);
    expect(attempt.publicationFrontier()).toBe(publication);
    expect(materializeFrontier(proof)).toEqual([a, b]);
  });

  it("materializes a captured proof graph once and reuses its immutable vector", () => {
    const first = dependency("first");
    const second = dependency("second");
    const builder = new FrontierBuilder();
    builder.add(first);
    builder.add(second);

    const attempt = new Attempt(1, () => true);
    attempt.frontier = builder.snapshot();

    const publication = attempt.publicationFrontier();
    expect(publication).toEqual([first, second]);
    expect(attempt.publicationFrontier()).toBe(publication);
    attempt.releaseEvaluationFrontier();
    expect(attempt.frontier).toBe(EMPTY_FRONTIER);
    expect(attempt.publicationFrontier()).toBe(publication);
  });
});
