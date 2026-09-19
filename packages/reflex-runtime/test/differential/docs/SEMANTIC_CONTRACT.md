# Differential semantic contract

The spec runtime defines observable behavior, not Reflex's graph representation.
It intentionally has no subscriber graph, dirty states, scheduling queue, edge
reuse, or specialized traversal. The shared expression interpreter is outside
the differential boundary; both machines receive exactly the same expression
semantics.

## Watcher rerun

Watcher state has two orthogonal obligations: `Unknown` requires dependency
validation, while `Changed` requires execution after validation. Therefore
`Unknown | Changed` validates first and then executes even when validation finds
all dependency versions unchanged.

`Visited` on entry records invalidation during the previous watcher callback.
The runtime normalizes it to the pending `Changed` obligation before validation.

A watcher rerun has the following observable order:

1. Validate every previously committed dependency before lifecycle begins.
2. If none changed and no `Changed` obligation is pending, do nothing.
3. Consume the previous cleanup before invoking it.
4. Execute that cleanup with dependency tracking disabled.
5. Execute the watcher computation with dependency tracking enabled.
6. Commit the newly collected dependencies only when computation succeeds.
7. Install the returned cleanup only when computation succeeds.

If cleanup throws, it remains consumed, computation is not attempted, and the
previous dependency snapshot remains semantically committed. A conservative
retry-trigger snapshot is baselined at the failure; a later change to that set
may retry the watcher without invoking the failed cleanup again.

If watcher computation throws, the consumed cleanup remains consumed. Partially
collected dependencies and a partial/new cleanup are not semantically committed.
The union of old and partially observed dependencies is retained separately as a
conservative retry-trigger set, baselined at the failure. A plain flush is a
no-op; a later change to that retry set permits another attempt.

If dependency validation throws while pulling a computed dependency, validation
has not committed and the watcher remains `Unknown`. No cleanup or computation
may begin until every committed dependency validates successfully. Any pending
or already confirmed `Changed` evidence survives the failure. A later explicit
flush may retry the same validation. Its result must not depend on whether that
computed was independently stabilized earlier in the operation trace.

## Failed computations

- **C1** A failed computed evaluation does not commit its partially collected dependencies.
- **C2** A failed computed evaluation does not commit a value or increment its semantic version.
- **C3** A failed computed evaluation remains retryable through its previously committed dependency snapshot.
- **W1** A watcher's previous cleanup is consumed before reevaluation starts.
- **W2** A failed watcher computation does not install partially collected semantic dependencies or a new cleanup; partial reads live only in a separate retry-trigger set.
- **W3** A watcher whose cleanup or computation failed is not retried by a plain flush, but remains retryable after a conservative retry trigger changes.
- **V1** Failed dependency validation does not make the watcher clean and remains retryable by an explicit flush.
- **V2** Validation retry behavior is independent of prior reads and pull traversal history.
- **V3** Validation covers the complete committed dependency snapshot before watcher lifecycle begins.
- **V4** `Unknown` and `Changed` are orthogonal for watchers; recovery preserves both outstanding obligations.
- **V5** Watcher invalidation evidence accumulates monotonically within an unsettled propagation wave. For independent incoming obligations: merge(a, b) = a | b

and therefore merge is commutative, associative and idempotent.
These rules express the transaction boundary: evaluation and validation are not
commitment. Errors are compared by normalized `name` and `message`. Stack traces
and object identity are deliberately not observable.

## Values and effects

Values use `Object.is` semantics. Consequently `NaN` equals `NaN`, while `-0`
and `0` differ. Effect events are ordered and include both `run` and `cleanup`
phases, so cleanup-before-rerun and cleanup-on-dispose are observable. Reads made
by cleanup never become watcher dependencies.

## Program generation

Normal differential generators maintain a model of the available producers,
readable nodes, and live watchers. They only emit valid reads, writes, and
disposals. Invalid operations belong in dedicated error-semantics properties so
random test budgets are spent on reactive behavior rather than input rejection.

The topology families deliberately include diamonds, dynamic branches,
value-shielding chains, cleanup-only reads, failing branches, multi-level
computeds, multiple watchers, and dispose/rerun sequences.

## Current boundary

Generated programs are acyclic by construction. Cycle behavior is intentionally
not specified here: it must only be added after Reflex chooses a public contract
for self-cycles and multi-node cycles. Scheduling/ownership and writes during
execution likewise require explicit DSL operations and contract decisions before
they become part of this oracle.

## Metamorphic equivalences

Under their stated preconditions:

M1. Independent source-write permutation before the same
    execution boundary does not change watcher lifecycle outcome.

M2. Independent dependency-read permutation does not change
    lifecycle outcome when exception precedence is unchanged.

M3. Inserting a pure identity computed does not change
    observable watcher lifecycle semantics.

## Oracle qualification

The reference implementation is never mutated. Mutation qualification executes
the same valid DSL program against SpecRuntime and a separate deliberately
faulty MutantRuntime, then compares the complete observation trace with the
same equality used by the production differential harness.

Every seeded semantic mutant has one explicit fault, a stable identifier, and a
runtime probe with two stages:

1. reached means the mutated semantic location executed.
2. infected means the mutant changed a decision or committed state.

A mismatch is accepted as a kill only when both stages occurred in that same
execution. This prevents accidental differences in the faulty implementation
from inflating the mutation score. Surviving mutants are therefore classified
as unreached, reached-but-not-infected, or infected-but-not-observed.

The curated qualification corpus covers Object.is value semantics, computed and
watcher failure atomicity, cleanup tracking and consumption, retry baselining,
and validation retryability. Its score measures the sensitivity of this
concrete corpus and oracle boundary; it is not a proof that SpecRuntime is
correct and it is not a substitute for random or bounded-exhaustive runs.

### Qualification cohorts

Development mutants are visible to corpus design and measure regression strength.
Holdout mutants are kept in a separate catalog and the first result is frozen in
HOLDOUT_BASELINE.md before any survivor-specific corpus change. A holdout
survivor is a result, not a failing test: the suite asserts the frozen score and
its reach/infection classification rather than demanding 100%.

Historical faults are neither development nor holdout mutants. They preserve the
minimized programs, fault class, discovery method, and fixing commit for real
defects previously found by this differential system. Their replay suite proves
that current SpecRuntime and Reflex agree on those programs; the provenance
prevents those known witnesses from being presented as independent holdout
evidence.

## Bounded exhaustive language

The bounded runner enumerates every syntactically valid program in one explicitly
defined setup-first sublanguage, then applies producer alpha-renaming reduction.
Its bounds, grammar, canonical program count, execution count, and first holdout
impact are frozen in BOUNDED_BASELINE.md.

An exhaustive pass means equivalence for that sublanguage only. It does not
generalize to deeper expressions, longer action traces, throwing expressions,
more nodes, or async schedules. Extending a bound or grammar creates a new
baseline rather than silently rewriting the meaning of the old result.

## Failure recovery continuation language

The recovery runner extends the setup-first bounded language with primed
watcher/computed graphs, conditional throwing branches, and every continuation
up to four reads, writes, and flushes. Its grammar and initial metrics are
frozen in RECOVERY_BASELINE.md.

This layer is deliberately independent of mutant IDs. It converts failure
infection into later observable behavior and raises the combined holdout result
to 6/6. It exposed a Reflex cleanup-timing divergence whose minimized witness
now lives in the historical catalog. The unchanged 18,660-program language has
zero post-fix divergences.

## Active divergence classification

Known, unfixed SpecRuntime/Reflex mismatches are executable data in
active-divergences.ts and are measured separately from historical fixed faults.
ADVERSARIAL_BASELINE.md records the bounded causal-permutation search, semantic
classification counts, severity, consequences, and negative evidence.

An active-divergence test passing means that the known mismatch was reproduced;
it does not declare the production behavior correct. After a runtime fix, the
entry moves to historical-faults.ts and its active count must disappear.

The active catalog is currently empty. The 776-program adversarial corpus has no
post-fix mismatch in this bound.

After failed watcher validation or computation, confirmed `Changed` evidence
must survive cold recovery. A watcher with a committed dependency change cannot
become clean before executing. `Unknown` remains set until the complete
committed dependency snapshot validates successfully; it is not replaced by
`Changed` for watchers.
