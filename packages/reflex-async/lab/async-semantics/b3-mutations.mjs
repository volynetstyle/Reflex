// Each mutation is applied to one disposable B3 bundle. Production files stay intact.
const asyncSource = "/reflex-async/lab/async-semantics/baseline.ts";
const frontier = "/reflex-async/lab/async-semantics/frontier.ts";

const publicationLoop =
  "for (const dependency of this.dependencies) {\n          runBeforeDependencyValidation";

export const b3Mutations = [
  {
    id: "live-frontier-reference",
    changes: [
      {
        target: frontier,
        edits: [
          {
            from: "let collector: Set<AsyncFrontierDependency> | undefined;",
            to: "let collector: Set<AsyncFrontierDependency> | undefined;\nexport let latestCachedFrontier: Set<AsyncFrontierDependency> | undefined;",
          },
          {
            from: "  for (const dependency of dependencies) {\n    recordAsyncRead(dependency);\n    dependency.track();\n  }\n}",
            to: "  latestCachedFrontier = dependencies;\n  for (const dependency of dependencies) {\n    recordAsyncRead(dependency);\n    dependency.track();\n  }\n}",
          },
        ],
      },
      {
        target: asyncSource,
        edits: [
          {
            from: 'withAsyncCapture } from "./frontier";',
            to: 'withAsyncCapture, latestCachedFrontier } from "./frontier";',
          },
          {
            from: "    track: () => activeExecution?.add(this),",
            to: "    track: () => activeExecution?.add(this),\n    source: this,",
          },
          {
            from: publicationLoop,
            to: "for (const dependency of (this.dependencies.size === 0 || latestCachedFrontier === undefined ? this.dependencies : new Set(Array.from(latestCachedFrontier, item => (item as { source: AsyncDependency }).source)))) {\n          runBeforeDependencyValidation",
          },
        ],
      },
    ],
  },
  {
    id: "skip-post-validation-authority",
    target: asyncSource,
    edits: [
      {
        from: "runBeforePublicationValidation();\n    if (!attempt.alive()) return;",
        to: "runBeforePublicationValidation();\n    // mutation: authority is not checked after the hook",
      },
      {
        from: "          if (!attempt.alive()) {\n            stillCurrent = false;\n            return;\n          }",
        to: "          // mutation: validation keeps running after supersession",
      },
      {
        from: "      if (!stillCurrent || !attempt.alive()) return;",
        to: "      // mutation: validation result grants authority",
      },
      {
        from: "        untracked(() => this.ensure());\n        if (!attempt.alive()) return;",
        to: "        untracked(() => this.ensure());",
      },
    ],
  },
  {
    id: "duplicate-diamond-validation",
    target: asyncSource,
    edits: [
      {
        from: publicationLoop,
        to: "for (const dependency of [...this.dependencies, ...this.dependencies]) {\n          runBeforeDependencyValidation",
      },
    ],
  },
  {
    id: "publish-after-validation-blocker",
    target: asyncSource,
    edits: [
      {
        from: "        void error.promise.then(() => this.finish(attempt, result));\n        return;",
        to: "        void error.promise.then(() => this.finish(attempt, result));\n        // mutation: publish the candidate despite the blocker",
      },
    ],
  },
  {
    id: "retain-old-frontier",
    target: asyncSource,
    edits: [
      {
        from: "    this.dependencies = new Set();",
        to: "    // mutation: old attempt dependencies survive branch changes",
      },
    ],
  },
  {
    id: "publish-obsolete-settlement",
    target: asyncSource,
    edits: [
      {
        from: "  private finish(attempt: Attempt, result: Result<T>): void {\n    if (!attempt.alive()) return;",
        to: "  private finish(attempt: Attempt, result: Result<T>): void {",
      },
      {
        from: "  private publish(attempt: Attempt, result: Result<T>, recheck = false): void {\n    if (!attempt.alive()) return;",
        to: "  private publish(attempt: Attempt, result: Result<T>, recheck = false): void {",
      },
      {
        from: "runBeforePublicationValidation();\n    if (!attempt.alive()) return;",
        to: "runBeforePublicationValidation();",
      },
      {
        from: "          if (!attempt.alive()) {\n            stillCurrent = false;\n            return;\n          }",
        to: "          // mutation: obsolete settlement keeps validating",
      },
      {
        from: "      if (!stillCurrent || !attempt.alive()) return;",
        to: "      // mutation: obsolete settlement may publish",
      },
      {
        from: "        untracked(() => this.ensure());\n        if (!attempt.alive()) return;",
        to: "        untracked(() => this.ensure());",
      },
    ],
  },
  {
    id: "drop-hidden-frontier",
    target: frontier,
    edits: [
      {
        from: "  for (const dependency of dependencies) {\n    recordAsyncRead(dependency);\n    dependency.track();\n  }\n}",
        to: "  // mutation: cached consumer contributes no hidden prerequisites\n}",
      },
    ],
  },
  {
    id: "early-blocker-evaluation",
    target: "/reflex-async/lab/async-semantics/evaluation.ts",
    edits: [
      {
        from: "    return evaluate(() => captureFrontier(dependencies, expression));",
        to: '    return { kind: "value", value: captureFrontier(dependencies, expression) };',
      },
    ],
  },
  {
    id: "skip-publication-frontier",
    target: asyncSource,
    edits: [
      {
        from: publicationLoop,
        to: "for (const dependency of [] as AsyncDependency[]) {\n          runBeforeDependencyValidation",
      },
    ],
  },
];
