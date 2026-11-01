# Testkit

One entry point for every test, oracle and check of the runtime. It catalogs
the suites, runs them at a budget, and adds cross-revision comparison,
replay, minimization, mutation and inventory. Nothing here is imported by
`src`.

```text
pnpm rt list                    the catalog: suites, layers, tiers, gates
pnpm rt run --tier smoke        seconds: the pre-commit loop
pnpm rt run                     minutes: tier ci
pnpm rt run --tier deep         release and nightly: 10x budgets, fuzzers
pnpm rt run <layer|id|prefix>   one part of the catalog
pnpm rt gate <kind>             the checks a change kind requires (docs/GUIDE.md)
pnpm rt diff ...                compare two builds over generated programs
pnpm rt replay <file>           re-run one program, show where traces part
pnpm rt mutate                  kill matrix of the oracle mutants
pnpm rt audit                   every fault-model mutant against every suite
pnpm rt doctor                  environment and catalog inventory
pnpm rt <command> --help        options of one command
```

Needs Node with TypeScript type stripping (22.18+); the oracle modules load
without a build.

## Layout

```text
registry.mjs          suites, tiers, gates: the catalog
cli.mjs, commands/    one file per command
lib/sides.mjs         which build a program runs on
lib/engine.mjs        sharded pairwise comparison
lib/executor.mjs      suites -> processes
lib/inventory.mjs     the catalog checked against the tree
lib/mutation.mjs      source mutation for audit (inert without REFLEX_MUTATIONS)
oracle/program.ts     program language, interpreter, invariants
oracle/families.ts    program families: default, general, hub, targeted, swarm
oracle/verdict.ts     verdict policies and accepted difference classes
oracle/reduce.ts      hierarchical minimization
oracle/mutants.ts     oracle mutants
oracle/faults.ts      fault models: development and holdout mutants
oracle/corpus/        committed regression corpus
```

The vitest suites and the CLI share these modules, so a rule exists once.

## Oracles

| Layer           | Oracle                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| `spec`          | `SpecMachine` in `test/differential/`, the executable [semantic contract](../docs/SEMANTIC_CONTRACT.md) |
| `oracle`        | the frozen baseline bundle (`oracle/baseline-commit.txt`) over generated programs                       |
| invariants      | algorithm-independent checks after every operation: edge integrity, exact read sets, liveness (L1, L4)  |
| metamorphic     | M1–M3 where no expected value exists                                                                    |
| `qualification` | seeded mutants: is each oracle strong enough?                                                           |

`SpecMachine` and `ReflexMachine` are private to `test/differential/`; test
languages use `api/dsl.ts`, `compare`, `assertEquivalent`, `explore` and
`compareTransformation`, so the oracle never couples to flags, queues or
walkers (`pnpm typecheck:differential`). Bounded languages enumerate every
program within stated bounds; an exhaustive pass covers that language only:

| Language    | Programs | Note                                                    |
| ----------- | -------: | ------------------------------------------------------- |
| bounded     |   27,061 | setup-first, producer alpha-renaming                    |
| recovery    |   18,660 | primed graphs, throwing branches, continuations up to 4 |
| adversarial |      776 | causal permutations; no mismatch after the F18 boundary |

Known unfixed mismatches are data in `test/differential/catalog/active.ts`
(empty now); a fixed one moves to `historical.ts` with its fixing commit.
Holdout mutants are kept apart and never retuned to the generator.

## Verdict policies

| Policy           | Accepts                                                                      | For                                          |
| ---------------- | ---------------------------------------------------------------------------- | -------------------------------------------- |
| `exact`          | nothing: byte-equal traces                                                   | A/A controls, mutants against source         |
| `representation` | `list-order`, `event-order`, `failed-computed`, with no new violations       | a refactor against HEAD                      |
| `baseline`       | `representation` plus the baseline corrections F13, F15, F1 domain, F17, F16 | the working tree against the pinned baseline |

An accepted class needs its own evidence (an invariant the baseline breaks, a
delivery inside the watcher's own run, a watcher left clean behind a dirty
source) and a corpus case. Where both sides exhaust the stack the result is
`inconclusive`: counted, neither passed nor failed. A divergent program is
re-run before minimization; one that does not repeat is reported as flaky.

## Principles

- **Generated programs, small counterexamples.** `reduce.ts` removes whole
  nodes in shrinking chunks, then operations; the predicate is the policy's
  rejection, so a minimized program fails for the original reason.
- **Know the generator.** `default` seeds 1–959 are all wide or deep specs; it
  stays frozen as a historical corpus. `general` decorrelates seeds (fmix32);
  `swarm` switches off a random feature subset per seed.
- **Qualify the oracle.** A mutant counts as killed only if it was reached and
  infected in the same execution. Unreachable mutants are documented gaps.
- **Every failure becomes a regression.** Minimized programs go to
  `oracle/corpus/` and replay on every run.
- **Controls first.** `self.aa-control` compares two instances of one build
  and must agree everywhere.
- **Pinned is not correct.** Tests that pin behavior the contract leaves open
  (F1, disposal from a hook) form the advisory `characterization` layer: a
  failure reports `changed`, decided in the owner document.

## Corpus

One JSON counterexample per file (schema in `lib/corpus.mjs`), replayed by
`oracle.corpus.test.ts` on the baseline and the working tree under the
`baseline` policy. `"expect": "agree"` must agree or differ in an accepted
class; `"expect": "diverge"` is an open difference and fails once it stops
diverging. `mutant-<id>.json` kills mutant `<id>` and seeds `pnpm rt mutate`.
`<family>-<seed>-<level>.json` comes from `pnpm rt diff`; commit it with the
fix or the acceptance rule. `origin` records how an entry was found. Add
entries; do not rewrite them.

## Audit

`pnpm rt audit` answers "which fault passes CI if this file goes?". Every
mutant of `oracle/faults.ts` is applied to `src` and every gating suite of the
tier runs against it, after a clean control run. Each mutant is traced
through reach, infect, propagate and observe. The audit lists sole witnesses
and stubborn mutants (at most two killers): those files stay. A file is a
removal candidate only when development **and** holdout mutants it kills are
covered elsewhere. The audit supplies evidence; it decides nothing alone.

## Sides

```text
side      := base ("+" modifier)*
base      := source | baseline | <git ref> | bundle:<path>
modifier  := <variant of perf/tracking-ladder/variants.mjs> | mutant:<id>
```

`--flavor` picks the build: `oracle` (test flags, unminified), `production`,
`readable` (production without mangling), `profile` (branch coverage).

```text
pnpm rt diff                                                  baseline vs working tree
pnpm rt diff --reference HEAD --policy representation --flavor production --families default,hub,targeted,swarm --jobs 6
pnpm rt replay .cache/testkit/corpus/swarm-6476-strict.json --full
pnpm rt replay --family hub --seed 42 --candidate HEAD --shrink
```

## Inventory

`pnpm rt doctor` and `self.testkit` require that every test file under
`test/` is owned by exactly one suite, every owned path and owner document
exists, every budget variable is read, and every corpus file is well-formed.

## Extending

- **Test file:** add it to a suite in `registry.mjs`; `doctor` fails until it
  is owned.
- **Program family:** add it to `oracle/families.ts`; keep `default` and `hub`
  unchanged, their seeds are pinned.
- **Mutant:** add it to `oracle/mutants.ts`, then
  `pnpm rt mutate --mutants <id> --record`.
- **Fault model:** add it to `oracle/faults.ts`; a reverted fix of a known
  finding is the strongest holdout.
- **Accepted difference class:** only for a finding in MODEL.md §9, with
  evidence, in `verdict.ts`, plus a corpus case.
