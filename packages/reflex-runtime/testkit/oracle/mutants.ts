/**
 * Seeded mutants of the baseline oracle (DeMillo, Lipton and Sayward 1978;
 * Papadakis et al., "Mutation Testing Advances", 2019). Each changes one
 * kernel decision through scripts/build-baseline-oracle.mjs --mutate; the
 * oracle is qualified when every `killed` mutant is distinguished from the
 * reference within the seed budget. One catalog, used by
 * oracle.qualification.test.ts and `pnpm rt mutate`.
 *
 * A mutant is not retuned around the generator: a mutant the generator cannot
 * reach is recorded as a `gap`, which the qualification test keeps honest by
 * failing when the gap becomes reachable.
 */
export interface Mutant {
  id: string;
  file: string;
  search: string;
  replace: string;
  /** Mutants the current generator cannot reach are documented gaps. */
  expected: "killed" | "gap";
  /** Program family; the default generator unless the mutant needs hubs. */
  generator?: "hub";
}

export const MUTANTS: readonly Mutant[] = [
  {
    id: "push-transitive-overmark",
    file: "src/kernel/stages/propagation/push_iterator.ts",
    search: "next = (state & ~Visited) | Unknown;",
    replace: "next = (state & ~Visited) | Changed;",
    expected: "killed",
  },
  {
    id: "advance-skip-stale-cleanup",
    file: "src/kernel/stages/stabilization/advance.ts",
    search: "cleanupUnvisitedSources(node);",
    replace: "void cleanupUnvisitedSources;",
    expected: "killed",
  },
  {
    id: "write-skip-equality",
    file: "src/protocol/write.producer.ts",
    search: "if (sameWrittenValue(prev, value) === true) {",
    replace: "if (false && sameWrittenValue(prev, value) === true) {",
    expected: "killed",
  },
  {
    id: "pull-keep-unknown-on-stable-pop",
    file: "src/kernel/stages/stabilization/pull_iterator.ts",
    search: "node.state &= ~Unknown;",
    replace: "void 0;",
    expected: "killed",
  },
  {
    id: "push-drop-computing-evidence",
    file: "src/kernel/stages/propagation/push_iterator.ts",
    search: "return (sub.state = state | Visited | Unknown);",
    replace: "return 0;",
    expected: "killed",
  },
  {
    id: "push-once-redeliver-scheduled",
    file: "src/kernel/stages/propagation/push_iterator_once.ts",
    search: "if ((state & (Scheduled | Computing)) !== 0) {",
    replace: "if (false) {",
    expected: "killed",
  },
  {
    id: "push-redeliver-unknown-watcher",
    file: "src/kernel/stages/propagation/push_iterator.ts",
    search: "if ((state & (Unknown | Computing)) === Unknown) continue;",
    replace: "void 0;",
    expected: "killed",
  },
  {
    // A located current-pass edge is taken for a suffix edge, so a duplicate
    // read moves it after the cursor and reorders the incoming list.
    id: "prefix-stamp-classification-false",
    file: "src/kernel/stages/tracking/prefix.ts",
    search: "if (passStamp !== 0) return edge.stamp === passStamp;",
    replace: "if (passStamp !== 0) return false;",
    expected: "killed",
  },
  {
    // A hint that outlives its edge (INV-H): after the consumer drops the
    // dependency, a later lookup of the same pair returns the detached edge.
    id: "hint-keep-on-unlink",
    file: "src/kernel/shape/graph/sweepEdges.ts",
    search: "if (from.tailIn === edge) from.tailIn = null;",
    replace: "void 0;",
    expected: "killed",
    generator: "hub",
  },
];

/** The `--mutate` argument of scripts/build-baseline-oracle.mjs. */
export const mutationArgument = (mutant: Mutant): string =>
  `${mutant.file}::${mutant.search}::${mutant.replace}`;
