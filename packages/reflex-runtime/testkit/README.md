# Runtime testkit

One entry point for every test, oracle and check of
`@volynets/reflex-runtime`. The testkit does not replace the suites: it
catalogs them, runs them at a chosen budget, and adds the tools the suites
lacked as commands (cross-revision differential runs, replay, hierarchical
minimization, mutation matrices, inventory). Nothing here is shipped or
imported by `src`, so the production bundle is unaffected.

```text
pnpm rt list                    the catalog: suites, layers, tiers, gates
pnpm rt run --tier smoke        seconds: the pre-commit loop
pnpm rt run                     minutes: tier ci, regular checks and controls
pnpm rt run --tier deep         release and nightly: 10x budgets, fuzzers
pnpm rt run oracle spec.watcher run by layer, id or id prefix
pnpm rt gate refactor           the checks a change kind requires
pnpm rt diff ...                compare two builds over generated programs
pnpm rt replay <file>           re-run one program, show where traces part
pnpm rt mutate                  kill matrix of the oracle mutants
pnpm rt doctor                  environment and catalog inventory
pnpm rt <command> --help        options of one command
```

`pnpm rt` runs `node testkit/cli.mjs` in this package. It needs Node with
TypeScript type stripping (22.18 or later): the oracle modules in
`test/oracle/*.ts` load without a build step.

## Architecture

```text
testkit/registry.mjs        suites, tiers, gates: the catalog (owner of what runs where)
testkit/cli.mjs             command dispatch; commands/ one file per command
testkit/lib/sides.mjs       which build a program runs on (source, refs, variants, mutants)
testkit/lib/engine.mjs      sharded pairwise comparison, worker threads, time boxes
testkit/lib/executor.mjs    suites -> processes (vitest suites with one config share a process)
testkit/lib/inventory.mjs   the catalog checked against the tree
testkit/lib/corpus.mjs      counterexample files
test/oracle/program.ts      program language, interpreter, invariants (unchanged owner)
test/oracle/families.ts     program families: default, hub, targeted, swarm
test/oracle/verdict.ts      verdict policies and accepted difference classes
test/oracle/reduce.ts       hierarchical minimization
test/oracle/mutants.ts      oracle mutant catalog
test/oracle/corpus/         committed regression corpus
```

The vitest suites and the CLI share these modules, so a rule exists once:
`oracle.differential.test.ts` and `pnpm rt diff` accept exactly the same
differences, and `oracle.qualification.test.ts` and `pnpm rt mutate` use the
same mutants.

CI runs the `self` layer through `test:testkit`, registered in the workspace's
[quality checks](../../../tooling/configs/quality-checks.json). This includes
the inventory check and an exact A/A control over all four program families;
the existing package test commands keep their budgets.

## Principles

Each principle names its source and where the testkit applies it.

**The oracle problem has several answers; use all of them.** Barr et al.,
"The Oracle Problem in Software Testing: A Survey" (TSE 2015) distinguish
specified, derived and implicit oracles. The runtime has each kind: the
executable specification `SpecMachine` (layer `spec`), the frozen baseline
as a derived pseudo-oracle (layer `oracle`; differential testing, McKeeman,
"Differential Testing for Software", 1998), algorithm-independent invariants
as implicit oracles (`interpret(..., { invariants: true })`), and metamorphic
relations where no expected value exists (`spec.watcher`; Chen et al.,
"Metamorphic Testing: A Review of Challenges and Opportunities", CSUR 2018).

**A difference is judged, not just detected.** Two correct builds may differ
in representation (adjacency order, sibling delivery order) and the baseline
has documented defects. `verdict.ts` names three policies (`exact`,
`representation`, `baseline`) and accepts each known class only with its own
evidence (an invariant the baseline violates, a delivery inside the watcher's
own run, a snapshot of a watcher left clean behind a dirty source). An
unexplained difference is never accepted.

**Random programs, small counterexamples.** Generated programs find what
examples miss (Claessen and Hughes, "QuickCheck", ICFP 2000); a failure is only
useful once it is small. `reduce.ts` removes whole nodes first, in chunks of
decreasing size (ddmin: Zeller and Hildebrandt, TSE 2002; hierarchical delta
debugging: Misherghi and Su, ICSE 2006), then operations and reads. The
reduction predicate is the policy's rejection, not "the traces differ", so a
minimized program still fails for the original reason and does not slip into
an accepted class (MacIver and Donaldson, "Test-Case Reduction via Test-Case
Generation", ECOOP 2020). A deep-chain witness of size 1,763 (1,054
consumers) reduces to 161 in under a second; the operation-level shrinker
alone, given ten times the steps, stopped at 1,531 after 20 s.

**Vary the feature mix (swarm testing).** A uniform generator puts nearly
every feature in nearly every program, so a feature that masks a failure is
almost always present (Groce et al., "Swarm Testing", ISSTA 2012). The `swarm`
family switches off a random subset per seed. On its first run it found
programs the `baseline` policy rejected: the F16 correction (a cleanup that
writes and throws), which 2,000 default seeds never reach. The policy now
accepts F16 with snapshot evidence; `corpus/swarm-6476-strict.json` keeps
the case.

**Small scope, exhaustively.** Most faults have small witnesses (Jackson,
_Software Abstractions_, 2006); within declared bounds, enumerate everything
(Runciman et al., "SmallCheck and Lazy SmallCheck", Haskell 2008). Layer
`spec`, suite `spec.exhaustive`; each language states its own bounds.

**Qualify the oracle.** An oracle that cannot tell a broken kernel from a
correct one proves nothing. Seeded mutants measure it (DeMillo, Lipton and
Sayward, 1978; Papadakis et al., "Mutation Testing Advances", Advances in
Computers 2019); coverage is recorded too but is not adequacy (Inozemtseva and
Holmes, ICSE 2014). Mutants are not retuned to the generator: an unreachable
mutant is a documented `gap`, and holdout mutants stay separate from the ones
the generator was developed against (`spec` layer). `pnpm rt mutate` prints
the kill matrix and the mutation score.

**Every found failure becomes a regression test.** Minimized programs go to
`test/oracle/corpus/` and replay on every test run (the corpus of
coverage-guided fuzzers: Zeller et al., _The Fuzzing Book_, "Greybox
Fuzzing"). Mutant witnesses are a seed corpus: `mutate` tries them first, so a
qualified oracle re-qualifies in one program per mutant.

**Controls before conclusions.** An A/A run compares two module instances of
one build under `exact` and must agree on every program (`self.aa-control`),
the testing counterpart of the paired benchmark's calibration run. Outcomes
that depend on the machine are not verdicts: where both sides exhaust the call
stack, the point of exhaustion depends on JIT state (two instances of one build
part there), so such a program is `inconclusive`, reported and counted but
neither passed nor failed (flaky tests: Luo et al., FSE 2014). A divergent
program is re-run before it is minimized; a verdict that does not repeat is
reported as flaky and not saved.

**Reproducible by construction.** A program is a function of its family and
seed; a side is a spec resolved to a commit and a bundle content hash; sharded
runs interleave seeds so the union of shards is the inline seed set. Every
counterexample and run record carries that provenance (`origin`, `.cache/testkit/reports/*.json`).

**Cost tiers, cheapest first.** Tests are sized by cost and run in order of
cost (Winters, Manshreck and Wright, _Software Engineering at Google_, 2020,
ch. 11 "Testing Overview"): static checks, then examples, then generated and
differential runs, then fuzzing. Tiers change budgets, not semantics: `smoke`
runs the same oracle with fewer seeds.

**The catalog is checked against the tree.** A test no suite owns never runs
under `pnpm rt run`; a budget no test reads does nothing. `pnpm rt doctor`
and the self-test fail on either (see Inventory).

## Verdict policies

| Policy           | Accepts                                                                       | For                                          |
| ---------------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| `exact`          | nothing: traces byte-equal                                                    | A/A controls, mutants against source         |
| `representation` | list-order and event-order differences without new violations                 | a refactor or policy change against HEAD     |
| `baseline`       | `representation`, plus the baseline corrections F13, F15, F1 domain, F17, F16 | the working tree against the pinned baseline |

The classes and their evidence are documented in `test/oracle/verdict.ts`.
`inconclusive` (both sides exhaust the stack) applies under every policy.

The independent invariant checker requires successful, non-reentrant
evaluation for exact dependency read sets. Recursively entering the same
callback resets its tracking frontier while the outer callback is active;
the next ordinary execution restores read-set checking. Graph integrity and
tail checks still run. Liveness checking ends if a host invalidation hook
throws: the write's committed value survives, but its aborted propagation
wave need not finish ([runtime contract](../docs/RUNTIME.md#producers)).

## Sides

```text
side      := base ("+" modifier)*
base      := source | baseline | <git ref> | bundle:<path>
modifier  := <variant of perf/tracking-ladder/variants.mjs> | mutant:<id>
```

`--flavor` picks the build of both sides: `oracle` (test flags, unminified,
as the vitest oracle), `production` (as dist and the paired benchmarks),
`readable` (production without mangling), `profile` (branch coverage).
Commit sides are cached by SHA under `.cache/testkit/sides`; the working tree
is rebuilt per process.

`replay` uses the commits recorded for immutable sides, retaining their
variants and mutants even if a branch has moved. A working-tree side uses
the current sources; its recorded hash identifies the earlier build but
cannot restore uncommitted edits. A mutant witness replays against its
recorded mutant by default; pass `--reference baseline --candidate source
--policy baseline` to check the current implementation as a regression.

```text
pnpm rt diff                                                  baseline vs working tree, as the vitest oracle
pnpm rt diff --reference HEAD --policy representation --flavor production --families default,hub,targeted,swarm --jobs 6
pnpm rt diff --reference HEAD --candidate HEAD+eager-detach --policy representation
pnpm rt diff --families swarm --time 10m --jobs 6 --max-failures 0
pnpm rt replay .cache/testkit/corpus/swarm-6476-strict.json --full
pnpm rt replay --family hub --seed 42 --candidate HEAD --shrink
pnpm rt mutate --mutate "src/protocol/write.producer.ts::<search>::<replace>"
```

## Catalog

`testkit/registry.mjs` owns the catalog; `pnpm rt list` prints it,
`pnpm rt list layers | tiers | gates | families | mutants | policies` the
rest. Gates mirror the table "Checks by change kind" of
[docs/GUIDE.md](../docs/GUIDE.md#checks-by-change-kind), which owns the
policy: a gate runs the automatable rows and prints the others (paired CI
timing, contract updates) as obligations it cannot discharge.

## Inventory

`pnpm rt doctor` and `self.testkit` require:

- every `*.test.ts`, `*.test.mjs` and `*.e2e.mjs` under `test/` is owned by
  exactly one suite, and a vitest suite's config includes the files it owns;
- every owned path matches a file, every owner document exists;
- every budget variable is read by one of the suite's files;
- every gate names known suites, every corpus file is a well-formed
  counterexample named after its id.

Files disabled by their name (`*.no_test.ts`) are listed as notes.

## Extending

- **A test file:** add it to the suite whose layer and technique it shares in
  `registry.mjs`, or add a suite; `pnpm rt doctor` fails until it is owned.
- **A program family:** add it to `families` in `test/oracle/families.ts`; it
  is available to `diff`, `replay` and `mutate` at once. Keep `default` and
  `hub` unchanged: their seeds are pinned.
- **A mutant:** add it to `test/oracle/mutants.ts`, run
  `pnpm rt mutate --mutants <id> --record` to store its witness.
- **An accepted difference class:** only for a documented finding
  (SEMANTIC_CHARACTERIZATION.md), with evidence that the baseline is wrong and
  the candidate violates nothing; add it to `verdict.ts` and commit the case
  to the corpus.
