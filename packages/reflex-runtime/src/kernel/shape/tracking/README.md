# Read Tracking Cache Hierarchy

This document describes the read-side dependency resolver used by the
tracking shape runtime.

The important mental model is:

```txt
tracking cursor = temporal read-order pointer
```

During a tracking pass, `consumer.tailIn` acts as the cursor for the last
dependency that has already been matched in the current read order. A new read
is resolved by walking a small hierarchy of locality tiers around that cursor.

The resolver is intentionally shaped like a cache hierarchy:

```txt
L0-L5: consumer-side optimistic locality
L6:    producer-side direct locality
L7:    suffix reconciliation
```

The goal is to keep the common path branch-light and pointer-local, while still
being able to repair reordered dependency lists without building a general
index.

## Hot Locality Tiers

### L0: Cursor Locality

The producer matches the current cursor edge.

This is the strongest locality signal: the same dependency is read again at the
same temporal position. The resolver updates the edge version and returns
without changing list structure.

```txt
cursor.from === producer
```

### L1: Sequential Locality

The producer matches the next edge after the cursor.

This is the normal stable-read-order case. The resolver advances the tracking
cursor to `cursor.nextIn`, updates the version, and keeps the existing edge in
place.

```txt
cursor.nextIn.from === producer
```

This tier is the old `nextHit` idea, described more precisely as sequential
locality.

### L2: Append Locality

The producer is new at the current cursor position.

When the cursor is already at the end of the incoming list, the cheapest correct
operation is to link a new incoming edge after the cursor. This handles normal
dependency growth without scanning or reordering.

```txt
cursor.nextIn === null
```

Conceptually this is append locality: the read order is growing at the tail.

### L3: Adjacent Reorder Locality

The producer is very close after the expected next edge.

Small local swaps are common enough to deserve direct checks, but not enough to
justify a general search on the hot path. The resolver checks the next one or
two edges after the expected sequential edge and moves a matching edge after the
cursor.

```txt
expectedNext.nextIn.from === producer
expectedNext.nextIn.nextIn.from === producer
```

This tier covers the old `oneHopReorder` and `twoHopReorder` paths. The more
general term is bounded adjacent reorder locality.

### L4: Tail Locality

The producer is the last incoming edge.

Some reorder patterns pull dependencies from the end of the list. If the
producer is already `consumer.lastIn`, the resolver can relocate that known edge
after the cursor without scanning the suffix.

```txt
consumer.lastIn.from === producer
```

This is the old `lastEdgeShortcut`, described as tail locality.

### L5: Prefix Duplicate Guard

The producer was already tracked earlier in this pass.

Before appending a new edge, the resolver must avoid creating a duplicate edge
for a producer that already appeared before the cursor in the current pass.
This guard checks prefix membership with a bounded, monomorphic result:

```txt
miss
hit
scan limit reached
```

If the prefix scan reaches its limit, the resolver can still use current-pass
edge information from the producer side to avoid appending a duplicate.

Before the bounded scan, structural proofs avoid unnecessary traversal:

- With an unvisited suffix, an empty outgoing list (or a sole edge to another
  consumer) proves absence. A matching incoming head with the requested nonzero
  version proves prefix membership, even beyond the scan limit.
- With the cursor at the physical tail, a matching current-version outgoing
  edge must belong to the visited prefix. Probe the outgoing tail first, then
  at most four outgoing edges. A complete probe without this consumer proves
  absence; an incomplete probe falls back to the original membership check.
- The incoming scan visits four links per loop iteration but retains exactly
  the same 32-edge limit and three-way result.

Zero versions and inconclusive version checks still use bounded traversal.
These shortcuts do not change the cursor, edge versions, tracking events,
strategy calls, or the handling of distant zero-version reads. They use only
existing graph links and add no node fields or membership allocations.

### L6: Producer-Side Direct Probe

The producer's outgoing list may point directly back to the consumer.

Consumer-side order can be chaotic while producer-side subscriber order remains
directly useful. The resolver therefore checks the producer-side edge before
falling back to a bounded incoming suffix scan:

```txt
producer.firstOut.to === consumer
```

This is producer-side locality:

```txt
Even when the consumer-side dependency order is chaotic,
the producer-side subscriber list may retain direct locality.
```

This tier is deliberately tiny. It is not an outgoing scan, not a `Map`, not a
`WeakMap`, and not an adaptive index. It uses an existing graph pointer as a
direct lookup opportunity.

### L7: Suffix Reconciliation

The resolver reconciles the remaining incoming suffix.

If all optimistic locality tiers miss, the runtime scans incoming edges after
the cursor, reuses and moves a matching edge when found, or links a new edge
when the search misses. The scan can reach the end of the suffix. The local
prefix and lookahead limits do not bound this reconciliation tier, and its
producer-side membership fallback can scan the producer's complete outgoing
list.

This tier used to be described as the slow path. A more precise name is suffix
reconciliation:

```txt
resolve from tracking suffix
reuse existing edge when bounded search finds one
otherwise link a new edge and let cleanup remove stale suffix edges
```

The term matters because this path is not just "slow". It is the repair tier
that preserves edge reuse without an auxiliary membership structure.

## Terminology

| Old term            | Preferred term             |
| ------------------- | -------------------------- |
| `nextHit`           | sequential locality        |
| `oneHopReorder`     | adjacent reorder locality  |
| `twoHopReorder`     | bounded adjacent reorder   |
| `lastEdgeShortcut`  | tail locality              |
| `slowPath`          | suffix reconciliation      |
| `outgoingProbe`     | producer-side direct probe |
| `appendAfterCursor` | append locality            |
| `prefixDuplicate`   | prefix membership guard    |

## Core Invariants

The hierarchy is performance-oriented, but it still protects the same graph
invariants:

- A current-pass read is represented by exactly one incoming edge for the
  producer/consumer pair.
- `consumer.tailIn` advances only after the read has been resolved.
- Existing edges are reused when a bounded local tier can identify them cheaply.
- New dependencies are linked after the tracking cursor.
- Stale suffix edges are left for cleanup or reconciliation instead of being
  eagerly preserved at unbounded cost.
- Producer-side probing must remain direct and tiny; it must not become a full
  outgoing-list scan.

## Optimization Rule

Prefer locality already present in the graph over new auxiliary structures.

The current hierarchy intentionally avoids paying a global tax for rare
pathological topologies. A full index, wide scan, or adaptive strategy should be
treated as a separate specialized mode, justified by profiling data, and kept
out of the default hot path until it proves that the graph itself cannot provide
enough locality.

## Comparing tracking and graph performance

The comparison script snapshots the compiled internal entrypoint with production
flags and tree shaking. It alternates independent Node processes for baseline
and candidate, with 10,000 warmup passes, 20,000 measured passes and nine samples
per variant. Dependency orders are prepared outside the timed loop. Results
include raw samples, Node version and CPU information.

Run from the repository root, saving the baseline before editing the runtime:

```sh
pnpm --filter @volynets/reflex-runtime build:ts
node scripts/compare-tracking-graph.mjs --save baseline
# Apply the runtime changes, then rebuild.
pnpm --filter @volynets/reflex-runtime build:ts
node scripts/compare-tracking-graph.mjs --save candidate
node scripts/compare-tracking-graph.mjs baseline candidate
```

Snapshots and the report are written to the ignored `temp/tracking-graph/`
folder. Workloads cover stable and duplicate reads, random reorder, shared
producer appends, incoming-edge moves, direct and scanned edge reuse, and an
end-to-end consumer recomputation. Interpret individual timings alongside the
unchanged stable-tracking and generic-move controls.
