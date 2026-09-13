export const holdoutSemanticMutants = [
  {
    id: "producer-write-skips-version",
    description: "A changed producer value does not increment its version.",
  },
  {
    id: "computed-change-keeps-version",
    description: "A changed computed value does not increment its version.",
  },
  {
    id: "computed-validation-trusts-cache",
    description:
      "An initialized computed trusts its cache across later revisions.",
  },
  {
    id: "watcher-cleanup-runs-after-computation",
    description: "Watcher cleanup runs after the replacement computation.",
  },
  {
    id: "watcher-dispose-skips-cleanup",
    description: "Disposing a watcher drops its installed cleanup.",
  },
  {
    id: "failed-computed-increments-version",
    description:
      "A failed computed evaluation increments its semantic version.",
  },
] as const;

export type HoldoutSemanticMutantId =
  (typeof holdoutSemanticMutants)[number]["id"];
