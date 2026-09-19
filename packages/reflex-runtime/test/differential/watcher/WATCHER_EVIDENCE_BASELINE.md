# Watcher evidence: readiness baseline

Prepared 2026-09-19 before adding the watcher-evidence differential suites.

This document deliberately records a **readiness baseline**, not a passing
semantic baseline. Rechecked on clean HEAD `28601c3`: the differential failures
below reproduce on committed code. The earlier run contained local changes,
but that observation did not establish those changes as the cause.

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

The same result was reproduced on clean HEAD `28601c3`. It is a reproducible
failure baseline, not an accepted semantic difference. The committed generator
has 40 added mixed-frontier programs, while its assertion still expects 776.
Keep language size and semantic correctness as separate assertions: updating
the count to 816 cannot resolve the 14 lifecycle differences.

## Follow-up review of the proposed architecture

The supplied analysis refers to `8c56acc`, `DIRTY_STATE`, and old catalog paths.
Current HEAD is `28601c3`, the evidence mask is named `Both`, and historical
records already contain `fixedBy: "8c56acc"`. No provenance replacement is
needed for those records.

### Role-specific transitions

The Boolean algebra applies to watcher obligations during an unsettled wave.
Ordinary computed invalidation has a different operational order:
`Clean < Unknown < Changed`. A directly invalidated computed must recompute;
it can discard its earlier uncertainty. Consequently a universal OR rule for
all reactive nodes would change existing consumer semantics. The introductory
comment in `meta.ts` currently states the rule too broadly.

| Existing evidence | Arrival                 | Watcher result | Computed result                          |
| ----------------- | ----------------------- | -------------- | ---------------------------------------- |
| Unknown           | direct change           | Both           | Changed                                  |
| Changed           | transitive invalidation | Both           | Changed                                  |
| Both              | either obligation       | Both           | Test role-specific reachable transitions |

These rows apply to non-computing nodes. Reentrant `Computing`/`Visited`
transitions need their own cases and cannot be inferred from this table.
Scheduler ownership is another observation: enriching an already notified
watcher with `Unknown` must not emit a duplicate scheduling notification.

Tests of `a | b` alone prove the model, not that the actual walkers implement
it. Pair the finite model with real graph transitions through `push_iterator`,
`push_iterator_once`, and the skipping variant. Observe evidence, appropriate
preservation of other flags, and notification counts. Do not require execution
flags such as `Visited` to remain unchanged when their stage explicitly clears
them.

### Full-frontier validator acceptance conditions

A specialized watcher validator is a reasonable second change after the
propagation defect has an executable witness and a focused repair. The supplied
pseudocode is not yet exception-safe: if one `advance` returns true and a later
dependency throws, its local `changed` result never reaches the caller. The
confirmed execution obligation must be retained before unwinding. Existing
watcher code handles this with `pendingChanged` and a catch path; preserve that
semantic guarantee when replacing its restart loop.

Additional obligations for that implementation:

- Preserve execution already justified by an independently warmed dependency,
  even when all dependencies inspected by the validator are now clean.
- Validate every committed dependency before consuming cleanup; preserve the
  original error precedence when more than one dependency throws.
- Handle Unknown leaves and reentrant/Visited states under their existing
  contracts. `Visited` alone is not proof that a node is an executable computed;
  `advance` assumes an executable callback.
- Respect `advance(dep, watcherEdge)` side-fanout behavior and keep sibling
  watchers informed while avoiding redundant invalidation of the current edge.
- Test retry after a partial successful validation followed by a throw, and
  retry after a second failure. Cleanup preservation and eventual rerun are
  separate assertions.
- Treat removal of `recoverWatcherAfterComputationError` as a separate
  hypothesis. A newly read dynamic dependency can still fail after committed
  validation completed. Initial failure, partial reads, plain-flush suppression,
  causal wake, and disposal need evidence before that recovery path is removed.

The current oracle already has a dedicated watcher validator and an explicit
`executionPending` obligation. Retain its version/snapshot representation;
inspect it as an executable contract rather than transplanting production bits.

### Metamorphic relations and qualification

For each transformation T, first establish the relation on Spec observations,
then assert the same relation on Reflex observations, and compare Reflex to Spec
for each program. This distinguishes an invalid transformation from a runtime
defect.

Identity insertion adds a setup operation, so raw trace-array equality needs an
explicit alignment of original operation boundaries. Ignore only the inserted,
unobserved setup step; retain errors and ordered lifecycle events. Do not sort
events to make traces match. Restrict read permutations to pure expressions
with invariant values and exception precedence; floating-point addition is not
generally associative. Restrict writes to independent sources before the same
boundary with no intervening read or callback. Adding a stable computed is an
equivalence only when its contribution to the observed result is neutral.

Add `watcher-validation-stops-after-first-confirmed-change` to the development
mutant cohort, scoped specifically to watcher validation. Require reach,
infection, and an observable kill on a mixed direct/derived case. It is a known
fault model, so it must not be reported as new holdout evidence. The executable
mutation host currently lives in `mutant/mutant-runtime.ts`; the similarly named
`internal/mutation/` files are empty scaffolding.

### Harness issues to address before interpreting new results

- In the adversarial classifier, the generic `sameError && actualCleanupOnly`
  branch returns before the specialized watcher-evidence branch. The latter is
  unreachable, and its family check also omits `watcher-evidence-frontier/`.
  Classify known mechanisms using case provenance and witnesses; identical
  cleanup symptoms alone do not prove identical causes.
- `op.watcher` accepts an `Expr` as its third argument, but two historical
  fixtures pass `{ cleanup: Expr }`. Audit and correct that mismatch before
  treating a passing replay as proof of the intended cleanup behavior.
  `tsconfig.json` currently excludes tests from its include list, so the normal
  typecheck does not validate those DSL callers or missing watcher case types.
- DSL `flush` directly runs watchers in insertion order and stops on the first
  throw. It does not exercise default/eager/SAB scheduler queues. Scheduler
  equivalence needs a separate integration adapter and an explicit batch
  boundary; the current differential results cannot establish it.

Implementation order: verify the DSL and classification boundary; freeze the
minimal failing witness and role-specific transition expectations; repair only
the propagation merge; enable the bounded and metamorphic watcher suites;
qualify the new mutant; then evaluate specialized validation and recovery
simplification as separate changes. Update structural projections and measure
performance after semantic checks. No runtime changes were made for this review.

## Implemented result

The watcher language was isolated from the adversarial corpus and is now driven
by the test-only evidence algebra. Before the propagation repair it reproduced
`40 programs / 14 divergences`; the adversarial corpus returned to its original
`776 / 0` boundary. The local watcher-specific transitive merge then reduced
the watcher language to `40 / 0` without changing ordinary computed dominance.

The executable checks now cover the four-element Boolean laws, correspondence
with runtime bit values, both arrival orders, preservation of `Scheduled`, no
duplicate invalidation notification, write/read permutations, identity-computed
insertion, and a qualified
`watcher-validation-stops-after-first-confirmed-change` mutant. Watcher frontier
validation and recovery simplification remain separate future hypotheses.
