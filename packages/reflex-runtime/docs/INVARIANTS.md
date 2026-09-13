# Runtime invariants

This contract describes the current intrusive graph and execution model.
Source and executable characterization take precedence over historical names
or stronger guarantees in older documentation.

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

## 2. Dirty and execution flags

Normal inactive computed nodes are clean, `Unknown`, or `Changed`.
`Changed` forces computation; `Unknown` normally requires lazy validation.
An unchanged derived value can suppress downstream recomputation.

The dirty bits are not globally exclusive. A watcher starts with
`Changed | Unknown | Watcher | Consumer`. Computing invalidation can also
combine both dirty bits.

`Visited` records invalidation during execution. A watcher may finish with
`Unknown | Visited`, retaining a rerun obligation. Stabilization uses
`Changed | Visited` as its force mask; this is not a general DFS visited set.

`Computing` marks callback evaluation and changes the interpretation of the
incoming prefix. The computing-subscriber path ignores an empty prefix and
edges beyond `tailIn`; accepted invalidation adds `Visited | Unknown`.
Preserve push branch order: direct promotion of an unknown non-watcher is
checked before the computing-subscriber branch.

`Scheduled` represents host queue ownership. It is independent of freshness;
successful execution does not automatically release a claim.

Definitions and transitions: `src/kernel/shape/meta.ts`,
`src/kernel/stages/`, and `src/kernel/engine/watcher.ts`.

## 3. Pruning and failure

Successful computation removes the incoming suffix after `tailIn`.
Reconciliation may eagerly abandon a suffix during a read, before computation
succeeds. Later reads may recreate abandoned dependencies.

Throws do not undo links, moves, stamps, or eager removal. Final stale cleanup
is skipped on callback failure. Computed failure leaves `Changed` to force
retry; watcher callback/cleanup failure clears transient flags so a later
invalidation can schedule it again using the remaining graph. That graph is
not an old-plus-new dependency transaction.

## 4. Cursor and tracking stamp

`lastIn` is the physical incoming tail. `tailIn` is the last accepted edge
of the current tracked prefix. Computation resets the cursor to null while
retaining the old list.

Head and expected-next hits advance the cursor. Recognized prefix duplicates
do not. Reorders move an existing edge after the cursor; new dependencies link
there. Cleanup removes the unmatched suffix.

`edge.version` is a tracking stamp, not a source-value revision. Runtime reads
extending a prefix use its cursor edge's stamp, even after nested computation
advances the global `trackingEpoch`. A first read uses the current epoch.
The explicit resolver API still accepts its supplied version.

The 32-edge prefix limit bounds only that local scan. Incoming suffix and
outgoing membership searches may traverse complete lists. The eager suffix
threshold is not a global reconciliation work bound.

## 5. Disposal

`disposeNode` eagerly removes both adjacency directions and clears executable
data. It does not set a terminal-state bit or normalize arbitrary flags.
Generic post-disposal reads/writes are not specified as inert.

`disposeWatcher` clears transient flags and invokes captured cleanup after
teardown. See [DISPOSE.md](./DISPOSE.md).

## 6. Cleanup ordering

Old watcher cleanup precedes rerun computation, with the payload cleared before
cleanup and tracking temporarily disabled. The callback is checked again after
cleanup because cleanup may dispose the watcher.

Disposal clears graph/executable data before cleanup, making recursive disposal
and throwing cleanup unable to repeat the saved cleanup. The runtime stores
one cleanup payload per watcher, not an ownership-tree cleanup stack.

## 7. Push and lazy pull

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
the walker.

An exception does not roll back source commits or completed recomputations, and
does not defer or transactionally complete the aborted propagation wave.

## 8. Nested execution and stack lifetime

Push and pull retain explicit reusable stacks. `base` is the invocation entry
slice, `top` its live continuation frontier, and `high` publishes occupied
storage before reentrant calls. Every exit restores the entry base and releases
only this invocation's abandoned references, preserving outer continuations.

Producer writes that open propagation scopes own their abort path. A nested
write borrows the existing scope; if its exception is caught by the outer
callback, it must not clear that outer scope.

Nested computation restores the active consumer. Cleanup and `untracked`
temporarily clear it and restore it on throws.

Production nested writes are synchronous, not queued behind the outer wave.
DEV scheduler policy, enabled by `__DEV__ && __PROFILE__`, rejects nested
propagation and direct nested pull while permitting pull through intervening
recomputation. Phase restoration is distinct from stack/register restoration.

## 9. Execution contexts

Contexts isolate runtime registers/configuration, not graph ownership. Several
contexts can access the same node flags, payloads, and edges.

Context switching copies live module registers and configuration to/from saved
context objects. `runWithRuntimeContext` restores the previous context in a
finally block. Traversal storage remains shared and is protected by invocation
slices.

Implementation: `src/kernel/context*.ts`, `src/kernel/state.ts`, and
`src/kernel/config.ts`.

## 10. Host scheduling

Push updates watcher state before calling `onNodeInvalidated`. The runtime
does not own a watcher queue or asynchronous timing. The host claims, queues,
releases, and runs watchers.

Unknown-to-changed promotion can notify again; queue deduplication is the
host's responsibility. Invalidation is distinct from `onRuntimeIdle` and
requested `onHostFlush` delivery. Batching defers idle delivery, not commits.

DEV policy forbids reactive reads, watcher execution, and watcher disposal from
the invalidation hook, while permitting host execution at the idle boundary.
It does not introduce a production liveness mechanism.

## Validation

Use `test/runtime/contracts/` for state, cleanup, hooks, recovery, and contexts;
`test/runtime/topology/` for reciprocal lists, duplicate reads, dynamic
branches, stabilization, and continuation lifetime; and `test/dev/runtime/`
for development policy and debug observation order.

Run production and development configurations separately. Shared debug test
imports may set `__DEV__`; production-branch tests must account for that.
Test presence is not a claim that a checkout passes.

Use non-profile production timing for performance claims. Structural profiling
adds work to traversal.
