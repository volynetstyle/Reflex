// Faults applied only to disposable production bundles, checked by the same B3 explorer.
const source = "/reflex-async/src/async/source.ts";
const frontier = "/reflex-async/src/async/frontier.ts";
const evaluation = "/reflex-async/src/async/evaluation.ts";

export const productionMutations = [
  {
    id: "live-frontier-reference",
    changes: [
      {
        target: frontier,
        edits: [
          {
            from: "export function inheritFrontier(frontier: EvaluationFrontier): void {",
            to: "export let latestInheritedFrontier: EvaluationFrontier = EMPTY_FRONTIER;\nexport function inheritFrontier(frontier: EvaluationFrontier): void {\n  latestInheritedFrontier = frontier;",
          },
        ],
      },
      {
        target: source,
        edits: [
          {
            from: "  recordFreshnessDependency,",
            to: "  materializeFrontier,\n  latestInheritedFrontier,\n  recordFreshnessDependency,",
          },
          {
            from: "const publicationFrontier = attempt.publicationFrontier();",
            to: "const publicationFrontier = attempt.frontier === EMPTY_FRONTIER ? attempt.publicationFrontier() : materializeFrontier(latestInheritedFrontier);",
          },
        ],
      },
    ],
  },
  {
    id: "skip-post-validation-authority",
    target: source,
    edits: [
      {
        from: 'if (!attempt.alive()) return { kind: "superseded" };',
        to: "// mutation: validation continues after authority is revoked",
        occurrences: 5,
      },
      {
        from: '        return { kind: attempt.alive() ? "valid" : "superseded" };',
        to: '        return { kind: "valid" };',
      },
      {
        from: '      case "valid":\n        if (!attempt.alive()) return;',
        to: '      case "valid":',
      },
      {
        from: "  private publish(attempt: Attempt, result: Result<T>): void {\n    if (!attempt.alive()) return;",
        to: "  private publish(attempt: Attempt, result: Result<T>): void {",
      },
    ],
  },
  {
    id: "duplicate-diamond-validation",
    target: source,
    edits: [
      {
        from: "for (const dependency of publicationFrontier)",
        to: "for (const dependency of [...publicationFrontier, ...publicationFrontier])",
      },
    ],
  },
  {
    id: "publish-after-validation-blocker",
    target: source,
    edits: [
      {
        from: "        void validation.blocker.promise.then(() =>\n          this.finish(attempt, result),\n        );\n        return;",
        to: "        void validation.blocker.promise.then(() =>\n          this.finish(attempt, result),\n        );\n        this.publish(attempt, result);\n        return;",
      },
    ],
  },
  {
    id: "retain-old-frontier",
    target: source,
    edits: [
      {
        from: "    const collector = new FrontierBuilder(this);",
        to: "    const collector = new FrontierBuilder(this);\n    collector.merge(this.frontier);",
      },
    ],
  },
  {
    id: "publish-obsolete-settlement",
    target: source,
    edits: [
      {
        from: "    if (!attempt.alive()) return;",
        to: "    // mutation: obsolete work retains publication authority",
        occurrences: 6,
      },
      {
        from: 'if (!attempt.alive()) return { kind: "superseded" };',
        to: "// mutation: obsolete validation continues",
        occurrences: 5,
      },
      {
        from: '        return { kind: attempt.alive() ? "valid" : "superseded" };',
        to: '        return { kind: "valid" };',
      },
    ],
  },
  {
    id: "drop-hidden-frontier",
    target: frontier,
    edits: [
      {
        from: "  activeFrontierCollector?.merge(frontier);",
        to: "  // mutation: cached reads lose their hidden prerequisites",
      },
    ],
  },
  {
    id: "early-blocker-evaluation",
    target: evaluation,
    edits: [
      {
        from: '      return { kind: "blocked", blocker: error };',
        to: "      throw error;",
      },
    ],
  },
  {
    id: "skip-publication-frontier",
    target: source,
    edits: [
      {
        from: "for (const dependency of publicationFrontier)",
        to: "for (const dependency of [] as FreshnessDependency[])",
      },
    ],
  },
];
