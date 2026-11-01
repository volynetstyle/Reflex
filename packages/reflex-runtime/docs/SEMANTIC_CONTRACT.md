# Semantic contract

The observable rules of the runtime, independent of its representation. The
executable specification `SpecMachine` (`test/differential/`) implements them
with no subscriber graph, dirty bits, queue or edge reuse; the differential
suites compare it with the runtime ([testkit](../testkit/README.md)).

Observable: values (`Object.is`), callback runs and cleanups in order, errors
by normalized `name` and `message`, host deliveries. Not observable: stack
traces, object identity, edge identity, adjacency order and the order of
sibling deliveries (see "Equivalence").

## Watcher rerun

`Unknown` asks for validation, `Changed` for execution after validation; they
are orthogonal, so `Unknown | Changed` validates and then executes even when
nothing changed. `Visited` on entry is execution evidence and becomes
`Changed`; `Revalidate` is validation evidence and is discharged by the next
validation.

1. Validate every committed dependency before any lifecycle work.
2. If nothing changed and no `Changed` is pending, stop.
3. Consume the previous cleanup, then run it untracked.
4. Run the callback tracked.
5. Commit the new dependencies and install the returned cleanup only if the
   callback succeeded.

Reads made by a cleanup never become dependencies.

## Failure

- **C1** A failed computed commits no dependency set.
- **C2** A failed computed commits no value.
- **C3** A failed computed stays `Changed`; its next demand runs the callback
  exactly once. While it is in that state its incoming edges are retry
  material, not a dependency snapshot, and may hold only what the failed
  attempt read.
- **C4** A computed read that throws is no observation: no dependency, no
  execution obligation, no retry trigger. A watcher that failed on that read
  is not re-entered when the cause is repaired; re-entry is the host's call.
- **W1** A watcher's previous cleanup is consumed before re-evaluation.
- **W2** A failed watcher installs neither its partial dependencies nor a new
  cleanup; its successful partial reads join a separate retry-trigger set.
- **W3** A watcher whose cleanup or callback failed is not retried by a plain
  flush, but is retryable once a retry trigger changes; a write made by the
  failing step is such a change.
- **V1** A failed validation leaves the watcher dirty and retryable by an
  explicit flush.
- **V2** Validation retry does not depend on earlier reads or pull history.
- **V3** Validation covers the complete committed dependency set before
  lifecycle work begins.
- **V4** Recovery keeps both `Unknown` and `Changed`.
- **V5** Watcher evidence within one unsettled wave merges by bitwise OR, so
  merge is commutative, associative and idempotent.
- **V6** A validation that fails after reentrant invalidation keeps `Visited`
  with `Unknown` and any confirmed `Changed`.

Evaluation and validation are not commitment.

### Failure boundary

- **R1** Failure cannot corrupt runtime state: consumer, phase, tracking
  context, edge lists and scheduler ownership are restored and the error
  escapes.
- **R2** Failure cannot erase committed evidence: dependencies and obligations
  established before it survive until a successful run discharges them.
- **R3** Failure creates no new evidence: a read that threw left no edge and no
  retry trigger.

Retry policy (transient errors, delay, reconnect, user-visible error) belongs
to the host or a framework layer, not the kernel.

## Reentrant invalidation and delivery

A write made while a watcher validates or executes may invalidate that same
watcher. Recording it is not enough; it must reach a later run.

- **L1 Delivery.** A watcher that ends a run, or a stable validation, with a
  retained obligation is handed to the host again unless the host owns it
  (`Scheduled`). An obligation no later run can discharge is a liveness
  defect.
- **L2 Evidence kinds.** A dependency read directly and changed afterwards is
  execution evidence. One reached only through a computed is validation
  evidence: the next run executes only if validation confirms a change.
  Confirmed `Changed` is never weakened.
- **L3 Exact cutoff.** With no confirmed change and no execution evidence, the
  watcher does not execute: a write-back that leaves every observed computed
  equal adds zero runs.
- **L4 Quiescence.** For a program with finite side effects, once the host has
  drained to quiescence, every live watcher whose last attempt succeeded has
  seen the current values of everything it read.
- **L5 Failure retry.** A failing cleanup or callback that dirtied a committed
  dependency leaves the watcher retryable on a later drain, never within the
  failing one.

## Metamorphic relations

- **M1** Permuting independent source writes before the same execution
  boundary does not change watcher outcomes.
- **M2** Permuting independent dependency reads does not change outcomes when
  exception precedence is unchanged.
- **M3** Inserting a pure identity computed changes nothing observable.

## Equivalence

Sibling delivery order, adjacency order and edge identity are deterministic in
this implementation but not chosen by the contract. Differential comparison
has three outcomes (`classifyTraceDifference`, `testkit/oracle/program.ts`):

- **semantic-equivalent**: identical traces;
- **representation-different**: equal once adjacency lists are compared as
  sets (`list-order`), or once entries of different nodes may interleave
  between two observations while each node keeps its own order
  (`event-order`). A failed computed's incoming edges are excluded from
  snapshots (`failed-computed`, C1/C3);
- **semantic-different**: anything else.

## Open regions

- **Cycles.** Generated programs are acyclic; cycle behavior is unspecified.
- **F1.** A computed invalidated during its own evaluation commits the value
  computed before the write and stays clean, so readers may miss the write.
  Rejection, convergence or a bounded policy is an owner decision; until then
  such programs are outside L1 and L4.
