# Arrays vs Linked Lists in `@reflex/beta`

This note summarizes when array-backed adjacency is the better fit for
`@reflex/beta`, when intrusive linked lists still make sense, and what the
current measurements say on V8.

## Short answer

For `@reflex/beta`, arrays are the better default.

They win when:

- the runtime is JS/TS on V8
- the hot path is dominated by traversal, not by arbitrary middle-node edits
- locality matters more than pointer elegance
- `unlink` can stay O(1) via `swap-remove`
- dynamic dependencies are common

Linked lists are only a better fit when the runtime truly needs semantics that
arrays do not provide cheaply:

- stable iteration order
- stable node positions
- removal from the middle without reordering
- long-lived cursors/iterators that must survive mutations

## Why arrays fit beta better

`@reflex/beta` spends most of its time doing three things:

1. walk downstream dependents during invalidation
2. walk current dependencies during freshness checks
3. rebuild dependency sets during dynamic tracking

Those are all traversal-heavy operations.

In V8, arrays are friendly to:

- contiguous access
- simpler JIT assumptions
- fewer pointer indirections
- better cache locality

That matters more here than the traditional linked-list argument of "cheap
insert/remove", because beta does not need arbitrary order-preserving removal.
It only needs:

- append
- scan
- dedupe
- unlink in O(1)

Once `ReactiveEdge` stores `outIndex` and `inIndex`, arrays can do that with
`swap-remove`.

## What arrays cost

Arrays are not free. The main tradeoff is memory shape.

Compared to the previous linked-list shape, the array-backed graph currently:

- retains more heap in wide static graphs
- stores adjacency containers on nodes
- pays for occasional element moves on `swap-remove`

That is a real cost, but in beta it is a better trade than slower hot-path
traversal.

## Measured results in beta

The comparison below was run directly against:

- current array-backed working tree
- a detached `HEAD` worktree with the previous linked-list implementation

Both were built separately and exercised with the same benchmark scripts.

### Wide static graph

Scenario:

- many memos
- fixed dependencies
- partial reads after writes

Results:

- `50k memos / 250k edges`: arrays `1.014 ms/op`, lists `1.577 ms/op`
- `25k memos / 125k edges`: arrays `0.475 ms/op`, lists `0.673 ms/op`

Interpretation:

- arrays are about `1.4x` to `1.6x` faster here
- this is the most "normal" beta workload: lots of traversal, little structural drama

### Dynamic dependency flip

Scenario:

- dependency sets change every tick
- all memos are read
- tracking and cleanup are exercised heavily

Results:

- `1k memos`: arrays `0.727 ms/op`, lists `14.717 ms/op`
- `2k memos`: arrays `1.655 ms/op`, lists `74.438 ms/op`

Interpretation:

- arrays are not just slightly better here; they are dramatically better
- the linked-list version degrades sharply under repeated branch switching
- this is the clearest signal that V8-friendly traversal beats pointer-heavy structure in beta

### Forced-GC churn

Scenario:

- repeatedly create and drop large wide graphs
- force `global.gc()` between rounds

Results:

- arrays and lists both return memory well
- final heap drift stays near zero in both versions
- `50k memos`: arrays `~15.0 ms` avg forced GC, lists `~16.5 ms`

Interpretation:

- arrays do not show pathological GC behavior here
- the GC story is "slightly different memory shape", not "broken under churn"

## Natural GC behavior on V8

We also profiled young-generation churn without calling `global.gc()`.

### Array-backed build

Dynamic churn, `12` rounds:

- `14` scavenges
- average scavenge pause: `3.17 ms`
- max scavenge pause: `9.33 ms`
- `1` mark-compact at `4.53 ms`

### Linked-list build

Same scenario:

- `17` scavenges
- average scavenge pause: `2.03 ms`
- max scavenge pause: `3.59 ms`
- `2` mark-compact pauses around `1.5 ms`

Important interpretation:

- the linked-list build had somewhat cheaper individual GC pauses
- but the actual workload runtime was vastly worse
- in practice, the array-backed version finishes the useful work much sooner

So the right conclusion is not "lists have better GC".
The better conclusion is:

- arrays spend a bit more memory
- V8 pays a bit more per collection
- but total runtime work drops so much that the trade is still favorable

## When arrays are the right choice

Choose arrays when:

- the structure is read far more often than it is surgically edited
- you can tolerate `swap-remove`
- you care about V8 throughput on real workloads
- the runtime is built around scanning adjacency, not maintaining stable insertion order
- branch switching and dynamic deps are important workloads

This describes `@reflex/beta` very well.

## When linked lists are the right choice

Choose intrusive linked lists when:

- order must be preserved under deletion
- iterators/cursors must stay stable across mutations
- the cost center is structural mutation, not traversal
- you need O(1) remove-from-middle without index repair
- you are optimizing for lower retained heap more than for traversal throughput

That does not match beta's current hot paths particularly well.

## Practical rule for beta

If the question is:

> "What gives the best real V8 performance for beta's graph?"

the answer is:

> array-backed adjacency with O(1) indexed unlink.

If the question is instead:

> "What is the cleanest traditional graph structure on paper?"

then intrusive lists can still look attractive, but that is not the metric that
won in measurement.

## Final recommendation

For `@reflex/beta`, prefer arrays by default.

Keep linked lists only if a future feature explicitly requires one of these:

- stable ordering as part of semantics
- stable cursor identity
- order-preserving middle removal on the hot path

Without those requirements, arrays are the better engineering choice for beta:

- faster on wide traversal-heavy workloads
- dramatically faster on dynamic dependency churn
- still well-behaved under V8 GC
- simpler to reason about once indexed unlink is in place
