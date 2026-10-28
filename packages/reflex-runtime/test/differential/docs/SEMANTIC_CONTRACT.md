# Differential semantic contract

The spec runtime defines observable behavior, not Reflex's graph representation.
It intentionally has no subscriber graph, dirty states, scheduling queue, edge
reuse, or specialized traversal. The shared expression interpreter is outside
the differential boundary; both machines receive exactly the same expression
semantics.

## Pull architecture and effect boundaries

The production pull implementation has three semantic layers. Their boundary is
an invariant; optimization may specialize within a layer but must not merge the
responsibilities back into one universal walker.

1. `shouldRecomputeCore` owns root/consumer policy. Root `Changed` is execution
   evidence, and only a completely stable root frontier may discharge root
   `Unknown`.
2. `pullDependencyDirty` proves one dirty dependency edge. Its result is
   edge-local and must not depend on the parent node's state. Its callers pass a
   single observation of `edge.from` and `dependency.state`, with the explicit
   precondition `state & Both !== 0`.
3. `pullDependencyDeep` is the continuation machine for an `Unknown`
   dependency with committed inputs. Its explicit stack stores dependency-edge
   continuations and remains safe under nested/reentrant pull execution.

Operations are classified by effects, not by their current JavaScript shape:

- Inspecting a clean edge is a pure graph read. It cannot execute user code,
  reenter the runtime, or mutate topology. Root handling may therefore advance
  locally without a post-operation `Changed` barrier or generic dirty proof.
- Dirty dependency proof may call `advance`, directly or while descending. It
  is a reentrancy barrier: callers must observe root/parent evidence after the
  proof and must read continuation links only after the barrier.
- `advance`, watcher cleanup, watcher execution, runtime hooks, and any future
  callback-bearing operation are effectful barriers unless a stronger contract
  proves otherwise.

The root path loads a dependency and its state once. A clean/dirty dispatcher
must pass that observation into the dirty helper rather than reloading the same
edge. Development cycle checks happen before clean classification.

The reusable stack and its retention/trim policy are implementation policy, not
pull semantics. Changes to retention must preserve owned-slice cleanup,
reentrant isolation, exception cleanup, and the public stack-statistics
contract, and must be qualified independently from traversal changes.

### Runtime effect taxonomy

The same classification governs future fast-path work outside pull:

| Domain      | Effect classes                                   | Barrier rule                                                                                               |
| ----------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Tracking    | pure read / may relink / may recompute           | Only relink/recompute paths may invalidate cached topology observations; recompute is a user-code barrier. |
| Propagation | merge evidence only / may schedule / may execute | Evidence merge is local; scheduling crosses ownership state; execution is a user-code barrier.             |
| Watcher     | validate / cleanup / execute / commit            | Validation may pull; cleanup and execute run user code; commit publishes only successfully completed work. |

A fast path may omit a barrier only when its effect class cannot produce the
evidence or mutation guarded by that barrier. Benchmarks qualify the cost of a
specialization; they do not replace this semantic proof.

## Watcher rerun

Watcher state has two orthogonal obligations: `Unknown` requires dependency
validation, while `Changed` requires execution after validation. Therefore
`Unknown | Changed` validates first and then executes even when validation finds
all dependency versions unchanged.

`Visited` on entry records a direct dependency invalidated after the previous
run read it; it is execution evidence, normalized to the pending `Changed`
obligation before validation. `Revalidate` records a dependency reached only
through a computed during the previous run; it is validation evidence only
and is discharged by the next validation (see L2).

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
- **W3** A watcher whose cleanup or computation failed is not retried by a plain flush, but remains retryable after a conservative retry trigger changes. A write performed by the failing cleanup or computation is such a change (L5).
- **C4** A computed read that throws is not a committed dependency and creates no execution obligation, but it is causal retry evidence: the enclosing failed attempt retains that computed, with the computed's own failure-time evidence, in its retry-trigger set (W2, W3). A repair of the cause therefore permits another attempt. Decided 2026-10-28 (F18); the runtime does not follow it yet (`catalog/active.ts`).
- **V1** Failed dependency validation does not make the watcher clean and remains retryable by an explicit flush.
- **V2** Validation retry behavior is independent of prior reads and pull traversal history.
- **V3** Validation covers the complete committed dependency snapshot before watcher lifecycle begins.
- **V4** `Unknown` and `Changed` are orthogonal for watchers; recovery preserves both outstanding obligations.
- **V5** Watcher invalidation evidence accumulates monotonically within an unsettled propagation wave. For independent incoming obligations: merge(a, b) = a | b
- **V6** If dependency validation fails after reentrant invalidation, the
  watcher preserves `Visited` together with `Unknown` and any confirmed
  `Changed` evidence. Recovery clears execution/scheduling ownership, not the
  evidence required by the retry.

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
execution likewise require explicit DSL operations before they become part of
this oracle. For watchers the contract decision is made (L1-L5 below) and is
checked by the liveness oracles listed there; for computeds it is open (F1).

## Reentrant invalidation and delivery

A write performed while a watcher validates or executes can invalidate that
same watcher, directly or through computeds. Recording the invalidation is not
enough: the obligation must reach a later run.

- **L1 Delivery.** A watcher that ends a run, or a stable validation, with a
  retained validation or execution obligation is handed to the host again,
  unless the host already owns it (`Scheduled`). A retained obligation that no
  later run can discharge is a liveness defect, not a valid state.
- **L2 Evidence kinds.** A dependency the watcher read directly and that
  changed afterwards (`Visited`) is execution evidence. A dependency reached
  only through a computed (`Revalidate`) is validation evidence: the next run
  validates and executes only when validation confirms a change or other
  execution evidence is pending. Confirmed `Changed` evidence is never
  weakened to validation evidence.
- **L3 Exact cutoff.** When validation confirms no change and no execution
  evidence is pending, the watcher does not execute: a write-back that leaves
  every observed computed equal adds zero runs.
- **L4 Quiescence.** For a program whose side effects are finite, once the host
  has drained to quiescence, every live watcher whose last attempt succeeded
  has observed the current values of everything it read. Final signal values
  may depend on effect order when effects race to write one signal; the
  property does not, so no scheduling order is specified.
- **L5 Failure retry.** A failing cleanup or computation that dirtied a
  committed dependency leaves the watcher retryable; the host retries it on a
  later drain, never recursively within the failing one.

### Semantic and representation equivalence

Sibling watcher invalidation/delivery order is deterministic for a given
implementation but not part of the public semantic contract unless separately
specified. The same holds for the order of a node's incoming and outgoing
edges and for edge identity. Callbacks have side effects, so these orders are
observable; the contract simply does not choose between them, and two
implementations that differ only there belong to one public semantics.

Differential comparison therefore has three outcomes
(`classifyTraceDifference` in `test/oracle/program.ts`):

- **semantic-equivalent:** identical traces;
- **representation-different:** equal once adjacency lists are compared as
  sets (`list-order`), or, in addition, once entries of different nodes may
  interleave differently between two observations (`event-order`). Every
  snapshot and read still agrees in content and order, the entries between
  two observations agree as a multiset, and each node's own entries keep
  their order (a cleanup still precedes its rerun);
- **semantic-different:** anything else.

The baseline oracle fails only on semantic differences and counts
representation differences. Exact representation remains a diagnostic: the
tracking ladder, graph fuzzers and oracle qualification still compare it.

Open region: a computed invalidated during its own evaluation (F1) commits a
value computed before the write and stays clean, so watchers reading it may
miss the write. Its semantics (rejection, convergence or a bounded policy) is
an owner decision; until then programs in that region are outside L1 and L4.

Evidence: `reflex.reentrant-liveness.test.ts` (L1-L3, dynamic topology),
`reflex.recovery-liveness.test.ts` (L5), `reflex.liveness-oracle.test.ts`
(L4 over generated programs, all effect strategies), and the liveness
invariant of `test/oracle` (L1 after every operation, reachability at
quiescence), which detects the pre-fix baseline.

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

The active catalog holds F18 (C4): two witnesses, recognized in generated
programs only when Reflex agrees at every operation with the spec under the
previous rule 4. The 776-program adversarial corpus has no mismatch in this
bound; it does not reach C4.

After failed watcher validation or computation, confirmed `Changed` evidence
must survive cold recovery. A watcher with a committed dependency change cannot
become clean before executing. `Unknown` remains set until the complete
committed dependency snapshot validates successfully; it is not replaced by
`Changed` for watchers.
