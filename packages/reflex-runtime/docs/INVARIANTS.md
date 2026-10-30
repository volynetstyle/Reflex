# Runtime invariants

The internal state model of the intrusive graph and its execution: what the
kernel maintains at operation boundaries, independent of the public API. The
public contract is [RUNTIME.md](./RUNTIME.md); observable lifecycle rules are
formalized in
[SEMANTIC_CONTRACT.md](../test/differential/docs/SEMANTIC_CONTRACT.md);
[RULES.md](./RULES.md) links the load-bearing rules to code and checks.
Source and executable characterization take precedence over this text.

## 1. Bidirectional edges

At graph-operation boundaries, each dependency edge occurs in its producer's
outgoing list and its consumer's incoming list. Neighbor links are reciprocal,
endpoints have null boundary links, and tracking represents each
producer/consumer pair once.

Moves change incoming order without changing outgoing membership. Pointer
updates inside an operation are not atomic. In particular, the debug event in
`cleanupUnvisitedSources` occurs after the incoming suffix is cut but before
its outgoing memberships are removed. It observes an intermediate state.

Graph operations live in `src/kernel/shape/graph/`. Tracking chooses when
reconciliation and pruning occur.

## 2. State flags

Defined in `src/kernel/shape/meta.ts`; production builds inline them as
literals (`config/rollup/inline-constants.ts`).

| Flag         | Meaning                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `Unknown`    | Upstream may have changed; validate before recomputing.                                                             |
| `Changed`    | Recompute or execute without first proving an upstream change.                                                      |
| `Visited`    | Direct invalidation during execution; on a watcher, execution evidence that may survive completion.                 |
| `Revalidate` | Watcher only: transitive invalidation during its validation or execution; survives as a validation obligation only. |
| `Computing`  | Callback active; propagation interprets the active incoming prefix accordingly.                                     |
| `Watcher`    | Watcher role.                                                                                                       |
| `Scheduled`  | Host queue ownership, claimed and released separately from execution.                                               |
| `Leased`     | May have an edge to the prepared tape's owner (INV-P); a stale bit costs a lookup, never an answer.                 |

`Both = Unknown | Changed` is the dirty mask. Normal inactive computed nodes are
clean, `Unknown`, or `Changed`. `Changed` forces computation; `Unknown`
normally requires lazy validation. An unchanged derived value can suppress
downstream recomputation.

The dirty bits are not globally exclusive. A watcher starts with
`Changed | Unknown | Watcher | Consumer`. Computing invalidation can also
combine both dirty bits. Producer/consumer DEV role constants share a bit and
are zero in production; do not infer a role from them. There is no terminal
disposal bit.

`Visited` and `Revalidate` are the two kinds of reentrant evidence.
Stabilization uses `Changed | Visited` as its force mask; this is not a general
DFS visited set. `Revalidate` is never part of the force mask: the next pass
validates, and equality cutoff decides whether to execute. A validation pass
discharges an entry `Revalidate`; only invalidation recorded during that pass
requests another.

`Computing` marks callback evaluation and changes the interpretation of the
incoming prefix. The computing-subscriber path ignores an empty prefix and
edges beyond `tailIn`; accepted invalidation adds `Visited | Unknown`, or
`Revalidate | Unknown` for a watcher reached transitively. Preserve push branch
order: direct promotion of an unknown non-watcher is checked before the
computing-subscriber branch.

`Scheduled` represents host queue ownership. It is independent of freshness;
successful execution does not automatically release a claim. `Unknown` is not
`Scheduled`: a watcher that keeps `Unknown` after a run or a stable validation
is delivered by `runWatcherCore` itself (`deliverRetainedValidation`,
`retainAfterExecution`) unless `Scheduled` is held, because later pushes merge
into a retained `Unknown` without notifying (contract L1).

A host releases `Scheduled` before it runs the watcher, so during the run
`Computing` is the ownership certificate. One-level push after a recompute
records `Changed` into a watcher that holds `Scheduled` or `Computing` but
does not deliver it. A running watcher already holds `Changed`, so this reaches
only the validation epoch: a pull proof recomputed a node with a side edge
into the validating watcher, and that same pass consumes the evidence (F17).
The guard leaves the reentrant write path unchanged: a write during the epoch
still goes through the computing-subscriber path and is delivered.

Transitions: `src/kernel/stages/` and `src/kernel/engine/watcher.ts`; the
transition table is characterized in
[SEMANTIC_CHARACTERIZATION.md](./characterization/SEMANTIC_CHARACTERIZATION.md).

## 3. Pruning and failure

Successful computation removes the incoming suffix after `tailIn`. That
cleanup is the only removal of stale dependencies: reconciliation during a
read moves or links edges and never unlinks the unvisited suffix.

Throws do not undo links, moves or stamps. Final stale cleanup
is skipped on callback failure. The remaining graph is not an old-plus-new
dependency transaction. Recovery restores flags only:

| Failure                     | Resulting state                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Computed callback           | `Changed`, so the next read retries, also after a failure during pull bubbling.                                |
| Watcher validation          | `Unknown` plus the retained `Changed`, `Visited` and `Scheduled`; a later run retries validation.              |
| Watcher callback or cleanup | As validation failure when a dependency is still dirty (the failing step may have written it); otherwise idle. |

A failed watcher is never retried recursively inside the failing drain; a host
retries a still-dirty watcher on a later drain (contract L5, W3).

## 4. Cursor and tracking stamp

`lastIn` is the physical incoming tail. While a node is `Computing`,
`tailIn` is the last accepted edge of its current tracked prefix (the
frontier). Computation resets the cursor to null while retaining the old
list.

Head and expected-next hits advance the cursor. Recognized prefix duplicates
do not. Reorders move an existing edge after the cursor; new dependencies link
there. Cleanup removes the unmatched suffix.

`edge.stamp` is a tracking stamp, not a source-value revision. Runtime reads
extending a prefix use its cursor edge's stamp, even after nested computation
advances the global `trackingStamp`. A first read uses the current epoch.
`resolveTrackedRead` derives the stamp itself; callers cannot supply one.

During a pass with a nonempty suffix, an incoming edge is in the tracked
prefix exactly when it carries the cursor's nonzero stamp (INV-T3): accepted
edges are stamped with the pass stamp, and suffix edges carry stamps of
earlier passes, which the forward-only clock makes smaller. With the cursor
at `lastIn` every edge is in the prefix (INV-T2). A read off the sequential
path is resolved by one exact lookup of the pair's edge, bounded by the
shorter of the producer's outgoing and the consumer's incoming lists, then
classified by these rules. The unvisited suffix keeps its edges until
cleanup, so a reread suffix producer moves its existing edge. Algorithm details:
[tracking research](../src/kernel/stages/tracking/RESEARCH.md).

The frontier reading of `tailIn` is required only while the node is
`Computing`; outside that phase the slot is semantically inactive and is
reused as the pair lookup's outgoing hint (INV-H). For a node that is not
`Computing`, `tailIn` is null, the residual incoming edge of its last pass,
or a hint: one of its own outgoing edges, attached to both lists. A hint
satisfies `from === node && to !== node`; an incoming edge has
`to === node`, so a self-edge always reads as incoming and is never written
as a hint. The lookup writes a hint only with an edge it has located past
its constant probes, only into a node that is neither `Computing` nor a
watcher. It uses a slot edge from the node as the answer for exactly its
pair, and any other one as an outgoing finger, the centre of a walk of at
most eight outgoing links raced against the lockstep; a missing or
different hint proves nothing, and absence is still proved by exhausting
the outgoing or the covered incoming walk. Every unlink of an edge clears
the hint that points to it, and every computation resets the slot to null
before it becomes a frontier, so a stale hint is never observed. The idle
uses of `tailIn` (unlink repair of the incoming cursor, the debug integrity
check, watcher validation's save and restore, which only watchers reach)
either accept a hint or never meet one. Source:
`src/kernel/shape/graph/hint.ts`.

The prepared tape (INV-P) makes a hint the address of a cell of one
consumer's incoming list. A tracking pass is named by its consumer and pass
stamp. A lookup by a computing consumer strikes when it enters the plain
lockstep or its finger race settles past six finger probes; the second
strike of a pass prepares the tape: one walk of the consumer's incoming list
writes every producer's slot to its own edge (a hint, under the rules
above) and sets `Leased` on it. Nothing is linked, moved or unlinked, and
stamps are untouched, so a failure at any point leaves the graph the lookup
would have left. The consumer then holds the lease, at most one at a time;
the lease is live while its owner is `Computing` with a frontier carrying
the prepared stamp, and is released (bits cleared over the owner's current
list) by the owner's next miss past a dead lease or by the next prepare.
While the lease is recorded, every edge linked to its owner gives its
producer the cell and the bit, or, for a producer that is `Computing` or a
watcher, withdraws the certificate; the prepare does the same for such a
producer. Coverage therefore holds under a live lease: every producer of an
attached incoming edge of the owner has `Leased`, because computations
derive `state` from itself and only the release clears the bit. A miss of
the owner's hint, at the entry of the lookup's continuations past the head
start, on an idle producer without the bit is a certificate of absence. A
bit is only a maybe: a producer whose cell was lost (its own computation,
another lookup's hint, a raw kernel frame) or that left the list keeps
taking the exact search, so a lost or stale cell costs a lookup, never a
second edge for a pair. Source: `src/kernel/shape/graph/tape.ts`.

## 5. Disposal and cleanup

Teardown and cleanup ordering are owned by [DISPOSE.md](./DISPOSE.md). The
invariants it maintains: disposal removes both adjacency directions and clears
executable data without a terminal bit; old cleanup precedes a rerun and runs
untracked; a captured cleanup cannot run twice.

## 6. Push and lazy pull

Source writes use `Object.is`, commit synchronously, then invalidate. Equal
writes return without propagation.

Push first handles immediate outgoing edges, then transitive DFS continuations.
Direct consumers become `Changed`; newly invalidated descendants become
`Unknown`. Dirty state suppresses repeated descendant expansion. This is not
a general topological sort across all edges in a DAG.

Pull descends through unknown dependencies and advances dirty dependencies.
Confirmed changes bubble; stable branches resume incoming siblings. Changed
derived results promote immediate subscribers through one-level push. The
active pull edge may be skipped because its continuation is already owned by
the walker. Layering of the pull machine:
[stabilization](../src/kernel/stages/stabilization/README.md).

An exception does not roll back source commits or completed recomputations, and
does not defer or transactionally complete the aborted propagation wave.

## 7. Nested execution and stack lifetime

Push and pull retain explicit reusable stacks. `base` is the invocation entry
slice, `top` its live continuation frontier, and `high` publishes occupied
storage before reentrant calls. Every exit restores the entry base and releases
only this invocation's abandoned references, preserving outer continuations.

Producer writes that open propagation scopes own their abort path. A nested
write borrows the existing scope; if its exception is caught by the outer
callback, it must not clear that outer scope.

Nested computation restores the active consumer. Cleanup and `untracked`
temporarily clear it and restore it on throws. Production nested writes are
synchronous, not queued behind the outer wave; the DEV scheduler policy that
rejects some nestings is part of the host contract in
[RUNTIME.md](./RUNTIME.md#development-scheduler-policy). Phase restoration is
distinct from stack/register restoration.

## 8. Execution contexts

Contexts isolate runtime registers/configuration, not graph ownership. Several
contexts can access the same node flags, payloads, and edges.

Context switching copies live module registers and configuration to/from saved
context objects. `runWithRuntimeContext` restores the previous context in a
finally block. Traversal storage remains shared and is protected by invocation
slices.

`trackingStamp` is one kernel-wide clock, not a per-context register. Edges are
shared and stamped with pass epochs, so the clock only moves forward and
never repeats a value: a repeated stamp would let a stale edge pose as a
current-pass membership proof and drop a dependency (F13). A context load
keeps the newer epoch, `setTrackingStamp` only moves it forward, a reset does
not rewind it, and it does not wrap (exact for 2^53 passes).

`snapshotRuntimeContext` is a register-bank checkpoint. Restoring it is legal at
a quiescent boundary of that context, or to unwind to a checkpoint taken by an
enclosing frame still on the stack. Restore never touches the epoch, which
only moves forward.

`configureRuntimeContext` on the active context reloads configuration only. It
never reloads execution registers (`currentConsumer`, depths, `runtimeState`)
from the saved object, whose copies are stale while the context is active.

DEV+PROFILE diagnostic state (phase stack, active hook stack, recompute depth)
belongs to the context that entered it. A switch saves it into the outgoing
context's `executionFrame` and loads the incoming one, so independent contexts
never see each other's phases or hooks. Production builds skip this entirely.

`resetRuntimeContext` rejects a context whose continuation is suspended below
the active one by `runWithRuntimeContext`. Resetting the active context is a
recovery tool; the caller asserts none of its continuations will resume.

Contracts: `test/runtime/contracts/runtime.context-registers.test.ts`,
`test/runtime/topology/runtime.domain-walkers.test.ts`,
`test/dev/runtime/runtime.domain-isolation.dev.test.ts`. Implementation:
`src/kernel/context*.ts`, `src/kernel/state.ts`, and `src/kernel/config.ts`.

## 9. Host scheduling

Push updates watcher state before calling `onNodeInvalidated`. The runtime
does not own a watcher queue or asynchronous timing. The host claims, queues,
releases, and runs watchers. Unknown-to-changed promotion can notify again;
queue deduplication is the host's responsibility. Invalidation is distinct
from `onRuntimeIdle` and requested `onHostFlush` delivery. Batching defers idle
delivery, not commits. The host-facing rules are in
[RUNTIME.md](./RUNTIME.md#watchers-and-host-scheduling).

## Validation

Use `test/runtime/contracts/` for state, cleanup, hooks, recovery, and contexts;
`test/runtime/topology/` for reciprocal lists, duplicate reads, dynamic
branches, stabilization, and continuation lifetime; and `test/dev/runtime/`
for development policy and debug observation order. The algorithm-independent
oracle (`test/oracle`) checks edge integrity, exact dependency sets and
liveness after every generated operation.

Run production and development configurations separately. Shared debug test
imports may set `__DEV__`; production-branch tests must account for that.
Use non-profile production timing for performance claims; structural profiling
adds work to traversal.
