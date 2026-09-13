# Differential semantic contract

The spec runtime defines observable behavior, not Reflex's graph representation.
It intentionally has no subscriber graph, dirty states, scheduling queue, edge
reuse, or specialized traversal. The shared expression interpreter is outside
the differential boundary; both machines receive exactly the same expression
semantics.

## Watcher rerun

A watcher rerun has the following observable order:

1. Validate the previously committed dependencies.
2. If none changed, do nothing.
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
has not committed and the watcher remains pending. A later explicit flush may
retry the same validation. Its result must not depend on whether that computed
was independently stabilized earlier in the operation trace.

## Failed computations

- **C1** A failed computed evaluation does not commit its partially collected dependencies.
- **C2** A failed computed evaluation does not commit a value or increment its semantic version.
- **C3** A failed computed evaluation remains retryable through its previously committed dependency snapshot.
- **W1** A watcher's previous cleanup is consumed before reevaluation starts.
- **W2** A failed watcher computation does not install partially collected semantic dependencies or a new cleanup; partial reads live only in a separate retry-trigger set.
- **W3** A watcher whose cleanup or computation failed is not retried by a plain flush, but remains retryable after a conservative retry trigger changes.
- **V1** Failed dependency validation does not make the watcher clean and remains retryable by an explicit flush.
- **V2** Validation retry behavior is independent of prior reads and pull traversal history.

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
