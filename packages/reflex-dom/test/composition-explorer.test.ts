import { describe, expect, it } from "vitest";
import { execute } from "./composition-explorer/execute";
import { explore } from "./composition-explorer/explore";
import {
  classifyEvidence,
  canonicalTraces,
  coverPrograms,
  difference,
  dominates,
  generateTrace,
  paretoFrontier,
  shrinkCase,
  shrinkTrace,
  transformations,
  validateCase,
  type Case,
  type Program,
} from "./composition-explorer/model";

const pairKey = (a: string, b: string) => `${a}|${b}`;

describe("Reflex composition explorer", () => {
  it("covers every valid source, consumer and owner pair", () => {
    const programs = coverPrograms();
    const pairs = new Set(
      programs.flatMap((program) => [
        pairKey(program.source, program.consumer),
        pairKey(program.source, program.owner),
        pairKey(program.consumer, program.owner),
      ]),
    );
    for (const source of [
      "signal",
      "computed",
      "memo",
      "model",
      "context",
      "ref",
    ]) {
      for (const consumer of [
        "jsx",
        "show",
        "switch",
        "for",
        "portal",
        "effect",
        "mounted-effect",
      ]) {
        expect(pairs.has(pairKey(source, consumer))).toBe(true);
      }
      for (const owner of [
        "component",
        "owned",
        "model",
        "model-independent",
      ]) {
        expect(pairs.has(pairKey(source, owner))).toBe(true);
      }
    }
    for (const consumer of [
      "jsx",
      "show",
      "switch",
      "for",
      "portal",
      "effect",
      "mounted-effect",
    ]) {
      for (const owner of [
        "component",
        "owned",
        "model",
        "model-independent",
      ]) {
        expect(pairs.has(pairKey(consumer, owner))).toBe(true);
      }
    }
    for (const host of ["dom", "ssr"] as const) {
      for (const source of [
        "signal",
        "computed",
        "memo",
        "model",
        "context",
        "ref",
      ]) {
        expect(
          programs.some(
            (program) => program.host === host && program.source === source,
          ),
        ).toBe(true);
      }
      for (const owner of host === "ssr"
        ? ["component"]
        : ["component", "owned", "model", "model-independent"]) {
        expect(
          programs.some(
            (program) => program.host === host && program.owner === owner,
          ),
        ).toBe(true);
      }
    }
    for (const consumer of ["jsx", "show", "switch", "for"]) {
      expect(
        programs.some(
          (program) => program.host === "ssr" && program.consumer === consumer,
        ),
      ).toBe(true);
    }
    expect(programs.length).toBeLessThan(80);
    for (const [source, consumer, owner] of [
      ["computed", "show", "owned"],
      ["model", "switch", "owned"],
      ["memo", "jsx", "component"],
      ["context", "portal", "model"],
      ["context", "portal", "model-independent"],
      ["ref", "for", "component"],
    ]) {
      expect(
        programs.some(
          (program) =>
            program.source === source &&
            program.consumer === consumer &&
            program.owner === owner,
        ),
      ).toBe(true);
    }
  });

  it("checks declared metamorphic relations over generated traces", async () => {
    const report = await explore();
    const families = new Map<Program, Set<string>>();
    for (const { input, traceFamily } of report.baselines) {
      const names = families.get(input.program) ?? new Set<string>();
      names.add(traceFamily);
      families.set(input.program, names);
    }
    for (const [program, names] of families) {
      const expected = canonicalTraces(program).map(({ name }) => name);
      if (program.host === "dom") expected.push("fuzz");
      expect([...names].sort()).toEqual(expected.sort());
    }
    for (const { input, observation } of report.baselines) {
      expect(observation.obligations.errors, JSON.stringify(input)).toEqual([]);
      expect(
        observation.obligations.ownerTopologyViolations,
        JSON.stringify(input),
      ).toBe(0);
      expect(
        observation.obligations.keyedViolations,
        JSON.stringify(input),
      ).toEqual([]);
    }
    const failure = report.comparisons.find(({ issues }) => issues.length > 0);
    if (failure !== undefined) {
      throw new Error(JSON.stringify(failure, null, 2));
    }
    expect(report.interactions.every((row) => row.divergences === 0)).toBe(
      true,
    );
    expect(
      report.interactions.some(
        ({ interaction }) =>
          interaction.includes("transform=identity-derived") &&
          interaction.includes("family=branch-bounce"),
      ),
    ).toBe(true);
    expect(
      Object.values(report.classifications).every((finding) =>
        ["VALID", "VALID_REDUNDANT", "VALID_SPECIALIZED"].includes(finding),
      ),
    ).toBe(true);
    if (
      typeof process !== "undefined" &&
      process.env.REFLEX_COMPOSITION_REPORT === "1"
    ) {
      console.log(
        JSON.stringify(
          {
            programs: report.baselines.length,
            comparisons: report.comparisons.length,
            classifications: report.classifications,
            interactions: report.interactions,
          },
          null,
          2,
        ),
      );
    }
  });

  it("checks the same relations at settled scheduler boundaries", async () => {
    const program: Program = {
      source: "computed",
      consumer: "show",
      owner: "component",
      host: "dom",
      identity: false,
      unrelated: false,
    };
    for (const strategy of ["sab", "flush"] as const) {
      const report = await explore(strategy, [program]);
      expect(
        report.comparisons.every(({ issues }) => issues.length === 0),
      ).toBe(true);
      expect(
        report.interactions.some(
          ({ interaction }) =>
            interaction.includes(`strategy=${strategy}`) &&
            interaction.includes("transform="),
        ),
      ).toBe(true);
    }
  });

  it("keeps keyed For rows stable through insert, move, delete and return", async () => {
    const program: Program = {
      source: "signal",
      consumer: "for",
      owner: "model",
      host: "dom",
      identity: false,
      unrelated: false,
    };
    const family = canonicalTraces(program).find(
      ({ name }) => name === "keyed-move-insert-delete-return",
    )!;
    const observed = await execute({ program, trace: family.trace });
    expect(observed.obligations.errors).toEqual([]);
    expect(observed.obligations.keyedViolations).toEqual([]);
    expect(observed.obligations.ownerTopologyViolations).toBe(0);
    expect(observed.obligations.childMounts).toBe(4);
    expect(observed.obligations.childCleanups).toBe(4);
    expect(observed.obligations.ownerEvents).toEqual([
      "model:mount",
      "model:cleanup",
    ]);
    expect(
      observed.obligations.lifecycle.filter((event) =>
        event.startsWith("row:2:mount"),
      ),
    ).toHaveLength(2);
  });

  it("keeps an independent model alive after component disposal", async () => {
    const program: Program = {
      source: "signal",
      consumer: "jsx",
      owner: "model-independent",
      host: "dom",
      identity: false,
      unrelated: false,
    };
    const trace = canonicalTraces(program).find(
      ({ name }) => name === "post-dispose-write",
    )!.trace;
    const observed = await execute({ program, trace });
    expect(observed.obligations.errors).toEqual([]);
    expect(observed.obligations.ownerTopologyViolations).toBe(0);
    expect(observed.obligations.ownerEvents).toEqual([
      "independent:mount",
      "independent:cleanup",
    ]);
    expect(observed.semantics.output.at(-1)).toContain(
      '|detached:<main><span data-state="on">2</span></main>',
    );
    const identity = transformations.find(
      ({ name }) => name === "identity-derived",
    )!;
    expect(identity.applicable({ program, trace })).toBe(false);
    expect(identity.applicable({ program, trace: trace.slice(0, 3) })).toBe(
      true,
    );
  });

  it("runs an active unrelated effect without changing the target", async () => {
    const program: Program = {
      source: "signal",
      consumer: "show",
      owner: "component",
      host: "dom",
      identity: false,
      unrelated: false,
    };
    const input: Case = {
      program,
      trace: canonicalTraces(program).find(
        ({ name }) => name === "branch-bounce",
      )!.trace,
    };
    const transformation = transformations.find(
      ({ name }) => name === "irrelevant-state",
    )!;
    const baseline = await execute(input);
    const variant = await execute(transformation.transform(input));
    expect(difference(baseline, variant, transformation.relation)).toEqual([]);
    expect(variant.cost.computations).toBeGreaterThan(
      baseline.cost.computations,
    );
  });

  it("compares pure initial client output with SSR output", async () => {
    for (const source of [
      "signal",
      "computed",
      "memo",
      "model",
      "context",
      "ref",
    ] as const) {
      for (const consumer of ["jsx", "show", "switch", "for"] as const) {
        const program: Program = {
          source,
          consumer,
          owner: "component",
          host: "dom",
          identity: false,
          unrelated: false,
        };
        const client = await execute({ program, trace: [] });
        const server = await execute({
          program: { ...program, host: "ssr" },
          trace: [],
        });
        expect(server.obligations.errors, `${source} × ${consumer}`).toEqual(
          [],
        );
        expect(client.semantics.output, `${source} × ${consumer}`).toEqual(
          server.semantics.output,
        );
      }
    }
  });

  it("shrinks a divergent trace and keeps cost out of the correctness oracle", async () => {
    const trace = [
      { kind: "write", value: 0 },
      { kind: "write", value: 2 },
      { kind: "settle" },
      { kind: "write", value: -1 },
      { kind: "dispose" },
    ] as const;
    const reduced = await shrinkTrace(
      trace,
      async (candidate) =>
        candidate.some((step) => step.kind === "write" && step.value === 2) &&
        candidate.some((step) => step.kind === "dispose"),
    );
    expect(reduced.length).toBeLessThan(trace.length);
    expect(reduced.some((step) => step.kind === "dispose")).toBe(true);
    expect(
      dominates(
        { reads: 1, computations: 0, invalidations: 0, domOps: 1 },
        { reads: 2, computations: 1, invalidations: 0, domOps: 1 },
      ),
    ).toBe(true);
    expect(
      paretoFrontier([
        { reads: 1, computations: 0, invalidations: 0, domOps: 1 },
        { reads: 2, computations: 1, invalidations: 0, domOps: 1 },
        { reads: 0, computations: 1, invalidations: 0, domOps: 1 },
      ]),
    ).toEqual([0, 2]);
    const initial: Case = {
      program: {
        source: "computed",
        consumer: "show",
        owner: "owned",
        host: "dom",
        identity: true,
        unrelated: true,
      },
      trace,
    };
    const minimal = await shrinkCase(
      initial,
      async (candidate) =>
        candidate.program.consumer === "show" &&
        candidate.trace.some((step) => step.kind === "dispose"),
    );
    expect(minimal.program.source).toBe("signal");
    expect(minimal.program.consumer).toBe("show");
    expect(minimal.program.owner).toBe("component");
    expect(minimal.trace).toEqual([{ kind: "dispose" }]);
    const showToSwitch = transformations.find(
      ({ name }) => name === "show-to-switch",
    )!;
    const applicableMinimal = await shrinkCase(
      initial,
      async (candidate) =>
        showToSwitch.applicable(candidate) &&
        candidate.trace.some((step) => step.kind === "dispose"),
    );
    expect(applicableMinimal.program.consumer).toBe("show");
    expect(showToSwitch.applicable(applicableMinimal)).toBe(true);
    const observation = {
      semantics: { output: ["ok"] },
      obligations: {
        childMounts: 1,
        childCleanups: 1,
        lifecycle: ["mount:1", "cleanup:1"],
        ownerEvents: [],
        ownerTopologyViolations: 0,
        keyedViolations: [],
        effects: [],
        errors: [],
      },
      cost: { reads: 1, computations: 0, invalidations: 0, domOps: 1 },
    };
    expect(classifyEvidence("unknown", [])).toBe("UNSPECIFIED");
    expect(
      classifyEvidence("equivalent", [
        { baseline: observation, variant: observation, issues: ["output"] },
      ]),
    ).toBe("DIVERGENT");
    expect(
      classifyEvidence("equivalent", [
        { baseline: observation, variant: observation, issues: ["output"] },
        { baseline: observation, variant: observation, issues: [] },
      ]),
    ).toBe("CONDITIONAL_DIVERGENCE");
    const moreReads = {
      ...observation,
      cost: { ...observation.cost, reads: 2 },
    };
    expect(
      classifyEvidence("equivalent", [
        { baseline: observation, variant: moreReads, issues: [] },
        { baseline: observation, variant: observation, issues: [] },
      ]),
    ).toBe("VALID");
    const baselineTradeoff = {
      ...observation,
      cost: { ...observation.cost, reads: 2, computations: 1 },
    };
    const variantTradeoff = {
      ...observation,
      cost: { ...observation.cost, reads: 1, computations: 2 },
    };
    expect(
      classifyEvidence("equivalent", [
        { baseline: baselineTradeoff, variant: variantTradeoff, issues: [] },
      ]),
    ).toBe("VALID_SPECIALIZED");
    expect(() =>
      validateCase({
        program: { ...initial.program, host: "ssr" },
        trace: [{ kind: "write", value: 1 }],
      }),
    ).toThrow("SSR programs only support an initial render");
    expect(() =>
      validateCase({
        program: { ...initial.program, consumer: "portal", host: "ssr" },
        trace: [],
      }),
    ).toThrow("This consumer requires a DOM host");
  });
});
