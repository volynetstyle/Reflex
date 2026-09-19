# Watcher evidence: readiness baseline

Prepared 2026-09-19 before adding the watcher-evidence differential suites.

This document deliberately records a **readiness baseline**, not a passing
semantic baseline. The working tree contains an unfinished change to
`src/kernel/stages/second/pull_iterator.ts`; its result must not be frozen as
the behavior of a release candidate.

## Contract under test

Only the evidence portion of a watcher state is in scope:

```text
None     = 00   no outstanding obligation
Unknown  = 01   committed dependencies require validation
Changed  = 10   execution is known to be required
Both     = 11   validate first, then execute
```

`Visited`, `Computing`, `Scheduled`, and node-role flags are deliberately
outside this algebra. They are traversal, lifecycle, or scheduling metadata;
they must be preserved by a transition but are not evidence values.

Within one unsettled propagation wave, incoming evidence is information that
can only accumulate:

```text
merge(a, b) = a | b
```

Validation may later discharge `Unknown`; that is a resolution transition, not
an algebraic merge and must be tested separately. Complement is useful as a
finite-algebra proof only. It is not a runtime transition: in particular,
`Changed` must never become `Unknown` by applying complement-like logic.

The externally observable safety property is stronger than a bit assertion:
if a watcher has `Both`, every previously committed dependency must validate
before its existing cleanup can run. A throwing derived dependency therefore
leaves the old cleanup installed and uncalled.

## Existing assets and boundary

- `test/differential/internal/machine/SpecMachine.ts` is an independent
  behavior oracle. It has no graph flags or scheduler queue, so it is the
  correct reference for lifecycle observations.
- `test/differential/internal/machine/ReflexMachine.ts` exposes the same DSL
  against the public runtime API. Its observation trace includes normalized
  errors and ordered `run`/`cleanup` events.
- `docs/SEMANTIC_CONTRACT.md` already states V5 and M1--M3: monotonic merge,
  write/read permutation invariance, and identity-computed equivalence.
- `runtime.adversarial-exhaustive.test.ts` already contains provisional mixed
  two- and three-dependency generators (`watcher-evidence-merge` and
  `watcher-evidence-frontier`). They belong in this directory once the common
  case builder is complete.

The new directory is presently scaffolding only:

| File                                           | Current state                                                | Consequence                                          |
| ---------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| `watcher-evidence-cases.ts`                    | Interface only; `DependencyId` and `WriteId` are not defined | It cannot yet typecheck as a standalone test module. |
| `watcher-evidence-exhaustive.ts`               | Empty                                                        | No canonical case enumeration exists.                |
| `runtime.watcher-evidence-exhaustive.test.ts`  | Empty                                                        | No differential assertion runs.                      |
| `runtime.watcher-evidence-metamorphic.test.ts` | Empty                                                        | No permutation or wrapper relation runs.             |
| `vite.config.ts`                               | Explicitly excludes `runtime.watcher-evidence-*.test.ts`     | Adding tests alone will not put them in CI.          |

The production state representation is a bitmask in
`src/kernel/shape/meta.ts`; it documents `Both`, but deliberately exports no
generic `mergeEvidence` helper. Do not add a universal hot-path abstraction
merely to make a unit test convenient. If an explicit helper is introduced,
its cost and inlining behavior need the normal runtime performance review.

### Primary implementation seam

The evidence loss described by this test family is a push-boundary concern,
not a reason to redesign watcher execution first. In
`src/kernel/stages/first/push_iterator.ts`, direct subscribers are handled in
phase 1 and transitive subscribers in phase 2. A watcher that receives direct
`Changed` first already has non-clean evidence when phase 2 arrives; phase 2
therefore does not add its later transitive `Unknown`. The reverse arrival
order is promoted to `Both` by the direct watcher path. This makes the
arrival order observable even though `meta.ts` declares merge to be `|`.

Conversely, `runWatcherCore` already treats an observed `Unknown | Changed` as
the required barrier: it saves the `Changed` obligation, validates committed
dependencies, and only then performs cleanup/execution. Differential tests
should lock that end-to-end behavior down. They should not assert a private
walker stack shape or prescribe a particular traversal repair.

## Test layers to add, in order

1. **Finite transition/algebra model (four values).** Keep it test-only unless
   production needs a named operation. Exhaust all 4 x 4 pairs and 4 x 4 x 4
   triples for join commutativity, associativity, idempotence, identity,
   absorption, distributivity, bounds, and complement. Check resolution in a
   different group, so a clearing transition cannot be accidentally blessed as
   a merge law.
2. **Bounded evidence differential cases.** Build named two- and
   three-dependency programs through the existing DSL and compare every
   operation with `SpecMachine`. The minimal two-dependency topology is a
   direct source plus a derived source which throws during validation. The
   three-dependency topology adds a value-shielded stable derived dependency.
3. **Metamorphic layer.** For each canonical topology, compare all independent
   source-write permutations; compare dependency-read permutations only where
   error precedence is unchanged; then compare direct source access with an
   inserted pure identity computed. Compare full observation traces, not
   internal flag values.
4. **Regression promotion.** A minimized discovered mismatch first enters the
   active-divergence catalog. After a fix it moves, with commit provenance, to
   `catalog/historical.ts`. Do not update a count baseline until the test is
   green on a clean worktree.

## Required case matrix

| Axis                 | Minimum values                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| dependency kind      | direct source; stable derived; throwing derived                                                            |
| read order           | every permutation of the dependencies involved                                                             |
| write order          | every permutation of independent writes before one flush                                                   |
| lifecycle            | with and without an installed cleanup                                                                      |
| validation result    | stable; changed; throws; then recovery                                                                     |
| wrapper metamorphism | direct source vs pure identity computed                                                                    |
| scheduler surface    | default; eager; SAB only after the public test harness can select them without testing private queue state |

The first two topologies yield 4 mixed-two cases and 36 mixed-three cases
before lifecycle and recovery dimensions. Those counts are a transparent
starting point, not a claim of exhaustive graph coverage.

## Current run and gates

Command used for the normal differential layer:

```text
pnpm --filter @volynets/reflex-runtime exec vitest run test/differential
```

Observed in the current working tree:

```text
9 test files passed, 1 failed; 27 tests passed, 1 failed
runtime.adversarial-exhaustive.test.ts:
  expected 776 programs / 0 findings
  observed 816 programs / 14 findings
  classification: cleanup-before-validation-completes
```

This is intentionally **not** a baseline because the run includes the local
`pull_iterator.ts` rewrite and the committed adversarial generator has grown
without a corresponding frozen expected count. Before enabling the new
watcher suite, establish a clean-worktree run and decide whether the 816-case
generator is the intended language. Only then: define the missing case IDs,
enable the suite in `vite.config.ts` (or give it a dedicated config/script),
and freeze the resulting case and finding counts here.
