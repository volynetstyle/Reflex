import { describe, expect, it } from "vitest";

import {
  compareTransformation,
  defineProgram,
  expr,
  op,
  type OperationAlignment,
  type Program,
} from "../api";
import { watcherEvidenceCases } from "./language";

describe("watcher evidence metamorphic relations", () => {
  it("is invariant under independent write permutations", () => {
    for (const group of groupCases((candidate) =>
      [candidate.topology, candidate.readOrder.join("-")].join("/"),
    )) {
      assertProgramsEquivalent(group.map(({ program }) => program));
    }
  });

  it("is invariant under dependency read permutations", () => {
    for (const group of groupCases((candidate) =>
      [candidate.topology, candidate.writeOrder.join("-")].join("/"),
    )) {
      assertProgramsEquivalent(group.map(({ program }) => program));
    }
  });

  it("is invariant when a direct source is wrapped in an identity computed", () => {
    const base = identityProgram(false);
    const transformed = identityProgram(true);
    const result = compareTransformation({
      base,
      transformed,
      alignment: [
        { base: 0, transformed: 0 },
        { base: 1, transformed: 1 },
        { base: 2, transformed: 3 },
        { base: 3, transformed: 4 },
        { base: 4, transformed: 5 },
        { base: 5, transformed: 6 },
        { base: 6, transformed: 7 },
        { base: 7, transformed: 8 },
      ],
    });

    expect(result.base.equivalent).toBe(true);
    expect(result.transformed.equivalent).toBe(true);
    expect(result.specEquivalent).toBe(true);
    expect(result.reflexEquivalent).toBe(true);
  });
});

function groupCases(
  key: (candidate: (typeof watcherEvidenceCases)[number]) => string,
) {
  const groups = new Map<
    string,
    Array<(typeof watcherEvidenceCases)[number]>
  >();

  for (const candidate of watcherEvidenceCases) {
    const id = key(candidate);
    const group = groups.get(id);
    if (group === undefined) groups.set(id, [candidate]);
    else group.push(candidate);
  }

  return groups.values();
}

function assertProgramsEquivalent(programs: readonly Program[]): void {
  const base = programs[0]!;
  const alignment: OperationAlignment[] = base.operations.map(
    (_operation, index) => ({ base: index, transformed: index }),
  );

  for (const transformed of programs.slice(1)) {
    const result = compareTransformation({ base, transformed, alignment });
    expect(result.base.equivalent, base.id).toBe(true);
    expect(result.transformed.equivalent, transformed.id).toBe(true);
    expect(result.specEquivalent, transformed.id).toBe(true);
    expect(result.reflexEquivalent, transformed.id).toBe(true);
  }
}

function identityProgram(wrapped: boolean): Program {
  const directRead = expr.read(wrapped ? "identity" : "direct");

  return defineProgram(wrapped ? "identity/wrapped" : "identity/direct", [
    op.signal("direct", 0),
    op.signal("failGate", false),
    ...(wrapped ? [op.computed("identity", expr.read("direct"))] : []),
    op.computed(
      "failing",
      expr.when(
        expr.read("failGate"),
        expr.fail("validation failure"),
        expr.value(0),
      ),
    ),
    op.watcher("watcher", expr.add(directRead, expr.read("failing")), {
      cleanup: expr.value("cleanup"),
    }),
    op.flush(),
    op.set("direct", 1),
    op.set("failGate", true),
    op.flush(),
  ]);
}
