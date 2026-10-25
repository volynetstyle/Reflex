# Reflex Dependency Tracking: Representation, Temporal Semantics, and Exact Pair Reconciliation

**Research note · 24 October 2026**  
**Implementation examined:** [`volynetstyle/Reflex`, PR #52](https://github.com/volynetstyle/Reflex/pull/52), head [`1cca2bc04aadfcb42bde41d5c70df6ed202a16d7`](https://github.com/volynetstyle/Reflex/tree/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7).  
**Merged:** squashed into `main` as `190a09e`; the commit hashes below refer to the PR branch.  
**Status:** description of a specific implementation, not a language-level specification or a claim about every version of Reflex. The last part of §9, _After PR #52: repeated pairs and the outgoing hint_, describes a follow-up branch (`perf/tracking-producer-hint`), not PR #52.

## Abstract

Reflex tracks dependencies as **identity-bearing edges in a bidirectional intrusive graph**. A consumer's reads during an evaluation determine its ordered incoming edge list. In contrast to systems that freely reconstruct subscriptions, Reflex's resolver normally **reuses existing `(producer, consumer)` edges**, because edge identity determines the edge's position in the producer's outgoing list, which in turn affects notification and validation order. This is a qualified preservation policy, not an unconditional promise: eager suffix detachment deliberately removes some old edges and can change subsequent subscriber order.

The October 2026 rewrite does not introduce per-edge **value revisions** or an auxiliary hash index. It separates three previously entangled problems: **locate** the exact edge of `(P, C)`, **classify** it as already accepted / not yet accepted in this pass, and **reconcile** the incoming list. Location uses a two-sided search bounded by the shorter adjacency list; classification uses an existing **tracking-pass membership stamp**. Stable sequential reads remain constant time and bypass the search altogether. The same prefix classifier is also used for reentrant propagation.

The central warning for readers of this design is simple: **`edge.stamp` records dependency membership in a tracking pass. It is not a producer value version, not a causal-change counter, and not sufficient evidence that a computed value is fresh.** The field was named `version` until 24 October 2026 (and the clock `trackingEpoch`); code linked at the PR revision below still uses those names.

## 1. What subsystem is being described?

This note describes **read-side dependency tracking**, not the entire reactive execution protocol. These are distinct operations:

1. **Tracking** observes reads while a computation or watcher callback runs and maintains the dependency relation.
2. **Invalidation (push)** propagates evidence that downstream work may be required.
3. **Validation (pull)** determines whether a dirty derived node really needs recomputation, applying equality cutoffs where appropriate.
4. **Scheduling** determines when host-owned watchers execute. Reflex's tracking resolver is not a scheduler.

They interact, but their state and evidence must not be collapsed into one informal meaning of “version.” See [`INVARIANTS.md`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/docs/INVARIANTS.md) and [`read.producer.ts`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/protocol/read.producer.ts).

### A vocabulary that should not be conflated

| Term                            | Meaning in Reflex                                            | What it does **not** mean                                                                                                        |
| ------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `P`, producer                   | Node whose value is being read                               | The computation that is currently executing                                                                                      |
| `C`, consumer                   | Node currently collecting reads                              | Necessarily an effect; it may be a computed node                                                                                 |
| `(P, C)`                        | Directed dependency relation, represented by an edge         | An ordered pair of read-site locations                                                                                           |
| `C.firstIn … C.lastIn`          | Physical doubly linked list of dependencies                  | Only the currently accepted reads                                                                                                |
| `C.tailIn`                      | Inclusive cursor / accepted-prefix frontier while C computes | Always the physical tail; outside a pass it holds a residual incoming edge or, on the follow-up branch, an outgoing hint (INV-H) |
| `P.firstOut … P.lastOut`        | Physical list of subscribers and their order                 | A disposable set with no ordering consequences                                                                                   |
| `edge.stamp`                    | Epoch stamp for **acceptance by a tracking pass**            | Producer value revision, value freshness, graph edit count                                                                       |
| `trackingStamp`                 | Monotonically advancing clock that supplies pass stamps      | Per-producer change counter                                                                                                      |
| `Unknown`, `Changed`, `Visited` | Execution/invalidation obligations                           | Alternative spellings for the edge stamp                                                                                         |

## 2. The representation and the actual contract

For every live dependency edge `e = (P, C)`, the **same object** appears in two linked lists:

```text
P.out:  ... <-> e <-> ...    (ordered subscribers of P)
                  |
                  | e.from = P, e.to = C
                  |
C.in:   ... <-> e <-> ...    (ordered dependencies of C)
```

Incoming moves update `prevIn/nextIn` without moving the edge in `P.out`. Creating a new edge appends it to `P.out`; unlinking an edge removes it from both directions. Therefore a dependency set alone does **not** fully characterize the graph's behavior. An observer who measures only final values or the set of dependencies can miss differences in subscriber traversal order.

For an **ordinary successful pass** with read sequence `R = [P₂, P₂, P₄, P₁, P₅]`, the final `C.in` order is `[P₂, P₄, P₁, P₅]`: first occurrences only, in first-read order. The resolver prefers existing live edges for these pairs; if an edge was detached earlier in reconciliation, a later read may instead create a replacement. Thus the precise claim is **identity-preserving reuse where the old edge remains available**, subject to an explicit identity-changing detachment policy.

The important distinction is **identity versus ordering**:

- Moving an existing edge inside `C.in` preserves its identity and place in `P.out`.
- Unlinking and later recreating an edge can move that subscriber to the end of `P.out`.
- That change is significant for the existing Reflex notification / validation order, even when values and final dependency sets agree.

See [`edge.ts`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/kernel/shape/edge.ts), [`linkEdge.ts`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/kernel/shape/graph/linkEdge.ts), and [`edgeList.ts`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/kernel/shape/graph/edgeList.ts).

## 3. What a tracking pass actually does

At the start of computation, `C.tailIn` is reset to `null`; the old incoming list is **not** immediately deleted. `enterConsumerTracking(C)` installs the active consumer and advances the global `trackingStamp`. **The first actual read uses the then-current `trackingStamp` as its stamp `S`**. This may be _later_ than the epoch at this consumer's entry if nested computations ran before its first read. After an edge becomes the cursor, later reads use **the cursor's stamp**, not a fresh read of the global clock. This distinction matters when nested computations increment the global epoch mid-pass.

At any moment during the pass, the incoming list has this logical partition:

```text
C.firstIn        C.tailIn          C.lastIn
    |                |                 |
    +---- PREFIX ----+----- SUFFIX ----+
      accepted in S        not accepted yet
```

The prefix consists of distinct dependencies accepted in order of first read. The suffix holds edges from older, possibly partly failed passes that have not been accepted in the current one. Each read of `P` must answer one question: **where is the unique live edge for `(P, C)`?**

| Lookup result           | Classification                                     | Resolver action                                                   |
| ----------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| Edge in accepted prefix | Duplicate read                                     | Do not advance cursor or create a second edge                     |
| Edge in suffix          | Previously known dependency read at a new position | Move that **same** edge immediately after cursor and stamp it `S` |
| No edge                 | New dependency relative to current live graph      | Link a new edge after cursor, stamp it `S`                        |

After a **successful** callback the remaining unmatched suffix is pruned. A thrown callback does **not** roll back list moves, link creation, stamps, or eager detachment, and it does not perform final stale-suffix cleanup. A later retry sees the partially reconciled graph and takes a new pass stamp.

The `@cost O(1) + O(k)` note still present in `read.producer.ts` refers to an older cursor-distance model; it should not be used as the cost definition of PR #52. The implementation sites are [`state.ts`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/kernel/state.ts), [`resolve.ts`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/kernel/shape/tracking/resolve.ts), [`advance.ts`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/kernel/stages/stabilization/advance.ts), and [`watcher.execution.ts`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/kernel/engine/watcher.execution.ts).

### Worked trace

Assume the previous `C.in` is `[a, b, c, d]` (these names denote producer-edge pairs). The current successful read trace is `[b, b, d, a, x]`, with fewer than 32 residual edges, so eager detachment does not fire:

```text
initial             [a b c d]          prefix = []
read b              [b | a c d]        move old b; stamp S
read b again        [b | a c d]        duplicate; no movement
read d              [b d | a c]        move old d; stamp S
read a              [b d a | c]        next-edge hit; stamp S
read new x          [b d a x | c]      link new x; stamp S
successful cleanup  [b d a x]          detach unmatched c
```

`a` was already next after the cursor, so it is a sequential hit, not a move. `b`, `d`, and `a` retain their outgoing-list positions; `x` is appended to its producer's outgoing list; `c` is unlinked. The visible `|` separates the accepted prefix from the suffix.

## 4. The crucial invariants: a temporal certificate, not a value revision

**INV-T1 — Prefix structure.** If `tailIn != null`, then `firstIn … tailIn` is a valid contiguous accepted prefix, and `tailIn` belongs to the incoming list.

**INV-T2 — Completed prefix.** If `tailIn === lastIn`, the suffix is empty. Every live incoming edge is in the prefix, regardless of its stamp. Watcher validation can deliberately set `tailIn = lastIn` to cover its committed frontier without doing new read tracking.

**INV-T3 — Stamp classification.** During normal tracking with `S != 0` and a **nonempty suffix**, the following is exact for an edge belonging to `C.in`:

```text
e ∈ acceptedPrefix(C)   ⇔   e.stamp === S
                              where S = C.tailIn.stamp
```

Why it is true: every accepted edge is stamped with `S`, and accepted edges are never moved behind the cursor. Unaccepted suffix edges were last stamped in strictly earlier passes of the same consumer; the epoch clock only advances and nested tracking cannot overwrite the outer cursor's stamp. The proof assumes valid graph operations and non-repeating pass stamps; `state.ts` documents exact integer uniqueness only while the epoch stays within JavaScript's safe-integer range.

`0` is a special case. It is used by manually created graph edges/test helpers, **not** by ordinary tracking passes. With stamp `0`, the classifier falls back to a physical prefix walk; it must not pretend an equality test is a certificate. With `tailIn === lastIn`, INV-T2 takes priority over any stamp comparison.

The corresponding code is short enough to serve as an executable definition:

```ts
function isEdgeInTrackedPrefix(C, cursor, e) {
  if (cursor === C.lastIn) return true;
  const S = cursor.version;
  if (S !== 0) return e.stamp === S;
  for (let p = cursor; p !== null; p = p.prevIn) {
    if (p === e) return true;
  }
  return false;
}
```

**Do not interpret this as:** “the producer's value was recomputed in pass `S`,” “the value is current,” or “this edge observed a value change.” Value freshness belongs to the separate dirty-state and pull-validation protocol. The edge stamp is a membership certificate over a particular temporal prefix.

See [`prefix.ts`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/kernel/shape/tracking/prefix.ts) and [rule R3](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/docs/RULES.md).

## 5. Exact lookup: two adjacency views race to establish identity

The off-sequence resolver must find the single edge for `(P, C)` or prove absence. It has two unsorted adjacency lists that both contain the same live edge if it exists:

- `P.out`: walk forward from `P.firstOut`, testing `e.to === C`.
- `C.in`: walk outward from the tracking cursor, testing `e.from === P` on both sides; edges already tested by the caller are excluded from this local search.

[`findEdgeInLockstep`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/kernel/shape/graph/findEdge.ts) first compares **up to four** outgoing edges. If unresolved, each round compares one outgoing edge and up to two incoming edges (`prevIn` and `nextIn`). It stops when either side finds the pair or the relevant traversal proves absence. No degree counters are needed, and neither degree must be known beforehand.

```text
FindPair(P, C, untestedIncomingBack, untestedIncomingAhead):
    try first four edges of P.out
    while unresolved:
        compare next edge of P.out
        compare next untested C.in edge backward, if any
        compare next untested C.in edge forward, if any
        if either complete adjacency view is exhausted:
            return absent
    return matched edge
```

The pseudocode suppresses the exact null-check order and assumes that the caller's prior comparisons plus the two incoming directions **cover all of `C.in`**. Passing arbitrary `back` and `ahead` pointers that leave a gap would invalidate the absence proof. The real function's initial, inner, and tail callers establish this coverage.

Let `d⁺(P) = |P.out|`, `d⁻(C) = |C.in|`. The search costs

```text
O(4 + min(d⁺(P), d⁻(C))) examined links
```

up to constant factors from scanning both incoming directions. The `4` is a workload-tuned outgoing head start, **not** a semantic requirement. For two unsorted, unindexed adjacency lists with pointer traversal and identity comparison as the only operations, a worst-case membership/absence query requires examining every member of at least one list: `Ω(min(d⁺, d⁻))`. Thus the algorithm meets the lower bound **for this representation and access model**. It is not a universal lower bound for pair lookup: a per-producer slot, per-read-site cache, hash index, or another representation changes the model.

Compared with the previous resolver, per off-sequence read:

| Read                           | Before                             | Now                                       |
| ------------------------------ | ---------------------------------- | ----------------------------------------- |
| stable, cursor duplicate       | O(1)                               | O(1), same code                           |
| adjacent reorder, tail edge    | O(1)                               | O(1), same code                           |
| append, short outgoing list    | O(1)                               | O(1)                                      |
| duplicate at the tail          | ≤ 4 + 32 + d⁺(P)                   | O(4 + min(d⁺(P), d⁻(C)))                  |
| distant reorder or duplicate   | ≤ 32 + 32 + 2·d⁺(P)                | O(4 + min(d⁺(P), d⁻(C)))                  |
| new dependency inside the list | ≤ 32 + 32 + d⁺(P), plus detachment | O(4 + min(d⁺(P), d⁻(C))), plus detachment |

For bounded producer fan-out a permutation is linear in the dependency count under both resolvers; what changes is the work per off-sequence read, which no longer depends on how far the edge moved.

**Important nuance:** the lookup is not used for every read. A stable `nextIn` hit, repeated current-cursor read, empty-list creation, close lookahead reorder, or direct tail shortcut can resolve reads before generic lookup. The overall cost of a pass includes these paths and any linking/cleanup; it is not simply `n × min(degrees)`.

## 6. Three structural miss cases, then reconciliation

The core [`resolveTrackedRead`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/kernel/shape/tracking/resolve.ts) prioritizes sequential locality. Its cold paths have different proofs:

**Initial miss:** the first old incoming edge did not match. If the old `lastIn` matches, move it to the front directly. Otherwise the accepted prefix is empty; a located edge can only be a suffix edge. Locate once, then reuse/link.

**Tail miss:** cursor is physically `lastIn`, so the suffix is empty. Existence is equivalent to a duplicate under INV-T2; stamps are irrelevant. Empty/singleton outgoing lists and a newest-outgoing-edge probe can settle this cheaply; otherwise use exact lookup. If absent, append.

**Inner miss:** an expected next edge exists but did not match. Check one-hop, two-hop, and physical-tail locality first. Otherwise locate `(P, C)` once (with an outgoing-tail probe). If found, test INV-T3: current-pass prefix edge means duplicate, older suffix edge means reuse. If absent, link.

After location, `reuseLocatedIncomingEdgeOrLink` performs **structural reconciliation without searching again**. For the default strategy that separation eliminates duplicate searches present in the old fallback. A separately configured `readTrackingStrategy` retains its historical call contract; the resolver still has to locate the edge first to reject duplicates, so a custom strategy can incur another lookup. This is an extension-point cost, not proof that the default resolver double-searches.

### Eager suffix detachment is an identity policy

When introducing a genuinely new dependency ahead of an unmatched suffix of at least **32** edges, the resolver may detach that suffix immediately. There is a retained exception: no eager detachment when the producer's outgoing list is empty and the current pass stamp is nonzero. Later reads can recreate some detached pairs, changing their edge identities and positions in producer outgoing lists. This behavior existed before PR #52; it remains to preserve observable order and differential equivalence.

Thus **32 is no longer a search budget** and must never be reported as a bound on off-sequence lookup. It governs a specific structural commitment with ordering consequences. The new exact lookup and the old identity-changing policy are separate decisions.

See [`reuseEdge.ts`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/kernel/shape/graph/reuseEdge.ts).

## 7. The same proof changes reentrant propagation

Tracking stamps are not producer value revisions, **but they are still useful outside the tracking resolver**. When a producer is written while a subscriber is computing, the push iterator needs to know whether the subscriber already accepted the invalidated dependency in its current incoming prefix. An unaccepted suffix edge does not supply the same execution evidence.

Previously `markComputingSubscriber` searched backward through incoming links to determine the edge's position relative to `tailIn`. PR #52 reuses `isEdgeInTrackedPrefix` (or direct edge/cursor identity) for the decision. In ordinary nonzero-stamp tracking this is **O(1) prefix classification**; during watcher frontier validation INV-T2 covers the whole committed list. The stamp-zero test-helper case still walks.

This does **not** collapse propagation into tracking. The decision of **whether this edge is within the active prefix** uses tracking evidence; the decision of **which dirty state or execution obligation to record** is handled by propagation's state machine. In particular, the push iterator's branch order and its distinct handling of `Unknown`, `Changed`, `Computing`, and watchers matter. See [`push_iterator.ts`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/kernel/stages/propagation/push_iterator.ts).

## 8. Comparison with alternative designs: compare obligations, not field names

A superficially similar `version` field can encode entirely different evidence. Compare the following design dimensions separately: edge uniqueness, identity preservation, in-pass duplicate classification, lookup/index preparation, subscriber order, and failure behavior.

| Approach                                 | Main idea                                                                                                                                                                                      | Relevant trade-off for Reflex                                                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Reflex PR #52                            | Existing intrusive edges + cursor locality + exact bidirectional pair lookup + pass-membership stamp                                                                                           | No additional lookup index, retains identity-aware reconciliation; pathological joint-wide lookup remains linear in smaller degree |
| Preact Signals                           | Temporary per-source pointer to the active dependency link, prepared and restored around a run                                                                                                 | Fast off-sequence link lookup in exchange for per-evaluation preparation/rollback and additional representation state              |
| Vue 3.5 reactivity                       | `dep.activeLink` with prepare/cleanup and link version markers                                                                                                                                 | Similar prepared-link lookup; different lifecycle and bookkeeping costs                                                            |
| alien-signals / Angular                  | Strong cursor/newest-subscriber locality and per-pass link evidence (`subsTail.version === cycle`, `knownValidAtEpoch === epoch`); a miss links a new edge instead of searching for an old one | Different link-reuse and ordering choices; do **not** infer matching Reflex edge-identity semantics from similar field names       |
| MobX                                     | Collect accessed observables and bind/diff dependencies after running; `lastAccessedBy_ === runId` is a one-slot duplicate guard                                                               | Different timing of reconciliation and different duplicate marking scope                                                           |
| Self-adjusting computation (Acar et al.) | Traces reused by reordering slices with order-maintenance timestamps                                                                                                                           | The Reflex stamp test is the degenerate case: one pass, two classes, a forward-only clock                                          |
| lite-signal (`@zakkster`)                | Pooled graph, cursor-based retracking and per-source/evaluation stamp optimizations                                                                                                            | Its proposed **per-edge value versioning** is a different concept from Reflex's pass-membership stamp                              |

Two ideas carried over. The per-pass stamp on the link (Angular's `knownValidAtEpoch`, alien-signals' `version`) is Reflex's pass stamp; INV-T3 makes it a complete prefix test instead of a fallback after a bounded scan. The producer's newest link (`subsTail`, `consumersTail`) is the newest-outgoing probe of the tail and inner misses.

The purpose of this table is **design-space classification**, not a validated apples-to-apples performance ranking or a blanket claim that competitors always create duplicates. Version-specific source references appear below; behavior must be established from code and tests at the version studied.

A documented example of the conceptual confusion: the [`lite-signal` LEDGER, experiment #14](https://github.com/PeshoVurtoleta/lite-signal/blob/e940fd9f06a4209f1ab2328cfdef20f6bc4e1623/LEDGER.md), explicitly corrects an earlier interpretation of Reflex `edge.version` as per-edge _value_ versioning. That correction is right. The October rewrite **strengthens the use of the existing tracking stamp as a membership proof; it does not turn it into a value version**. The historical `find-with-reorder` description characterizes an earlier resolver, not this exact pair-lookup implementation.

Sources: [Self-adjusting computation, ESOP 2012](https://software.imdea.org/~rleywild/publications/esop12/esop12.pdf), [Preact Signals core](https://github.com/preactjs/signals/blob/main/packages/core/src/index.ts), [Vue reactive dependency code](https://github.com/vuejs/core/blob/main/packages/reactivity/src/dep.ts), [alien-signals](https://github.com/stackblitz/alien-signals), [Angular signal graph](https://github.com/angular/angular/blob/main/packages/core/primitives/signals/src/graph.ts), [MobX derivation](https://github.com/mobxjs/mobx/blob/main/packages/mobx/src/core/derivation.ts), [lite-signal](https://github.com/PeshoVurtoleta/lite-signal).

## 9. Evidence, scope, and negative results

The PR's claims should be interpreted at **three different evidence levels**.

**A. Algorithmic and structural verification.** A graph-level differential fuzz compared the old resolver with the proposed one over **200,000** generated scenarios, including reorder, duplicate reads, nested pass-epoch advances, producer disposal and exceptions. It compared incoming/outgoing order, edge identity, stamps, and cursor, and reported **zero differences**. Two oracle mutants (`prefix-stamp-classification-false`, `reconcile-skip-eager-detach`) were distinguished. `runtime.tracking-prefix.test.ts` checks lookup and classification against brute force on passes that satisfy INV-T3, including stamp `0`. This is substantial _differential evidence_, not an independent proof that both implementations satisfy every desirable semantic contract.

**B. Targeted local timing.** In the comparison harness, permutation cases improved by **2.66×** (fan-out 1), **5.12×** (fan-out 3), and **4.59×** (512 dependencies, fan-out 3); `reuse-scanned` improved **4.65×**, and end-to-end `runtime-reorder` improved **2.46×**. Stable/cursor-duplicate cases stayed effectively unchanged. The wide × wide stress regimes improved **2.7–3.5×** over the previous resolver but still cost roughly **290–370 ns/read**, compared with approximately **18 ns/read** in one fan-out-3 permutation scenario. These are workload-specific measurements, not universal speedups.

**C. Paired CI regression check.** [Run 40110256686](https://github.com/volynetstyle/Reflex/actions/runs/40110256686) completed successfully. Its controlled comparison uses the JIT-hint baseline (`56c2540` for that run) and candidate (`815d2c0`), rather than comparing an arbitrary older release to all PR changes. The tracked steady-state case was approximately unchanged; `A.track.reorder-8` was **+0.5%** with a **[−0.8%, +1.6%]** interval; broad fan-in/fan-out cases were classified as equivalent. `B.chain.depth-1000` was inconclusive. This establishes _no detected broad regression in the measured suite_, not absence of regressions in every application.

### The actual remaining pathological topology

Let `D_e = min(d⁺(P_e), d⁻(C_e))` for an edge read that reaches exact lookup. A high producer fan-out **alone** is not enough to make this expensive; neither is a high consumer fan-in alone. The costly case is **off-sequence reads connecting two wide endpoints**.

A PROFILE-side experiment used 512 producers with fan-out 64, shuffled dependencies, and different levels of consumer interleaving:

| Workload                               | Reads reaching generic lookup | Examined links per read | Producer single-slot hit on use | Lazily armed slot hit | Links/read with arm simulation |
| -------------------------------------- | ----------------------------: | ----------------------: | ------------------------------: | --------------------: | -----------------------------: |
| One consumer                           |                           96% |                      75 |                           99.5% |                  100% |                            2.0 |
| Eight consumers, fixed order           |                           95% |                      75 |                              0% |                  100% |                            2.0 |
| Sixty-four consumers, shuffled         |                           93% |                      69 |                              0% |                  100% |                            1.9 |
| Eight consumers, nested passes         |                           96% |                      75 |                              3% |                   85% |                           13.0 |
| All 25 normal timed `bench/` workloads |                        **0%** |                       0 |                               — |                     — |                              — |

A slot filled only upon use thrashes under interleaved consumers. A slot **armed** for every dependency at the first miss of a pass survives much better, but performs `Θ(d⁻(C))` writes to build a temporary per-pass index. These figures report a simulation's link counts and hit rates, **not a production-timed implementation** of that index or proof of its end-to-end speedup. The decision recorded in the PR is therefore to keep lockstep as the default representation and reconsider arm only after real application traces show both a significant generic-lookup fraction and large `D_e`.

A suggested approximate work model is `p·n·D` for lookup work versus `n + p·n` for lazy indexing, with `n` dependencies and generic-miss fraction `p`; it deliberately ignores heterogeneous pointer read/write costs, invalidation and initialization. It is an **engineering screening heuristic**, not a measured break-even theorem.

Marginal evidence for skewed graphs exists: a study of about 20,000 EUSES and Enron spreadsheets reports an average fan-out below 5 for most spreadsheets beside a tail of hubs; Solid 2 diagnoses 2,000 subscribers as `HUGE_FAN_OUT` and wide fan-in separately; Vue treats one render reading 100,000+ properties as a special case. None of these measures the joint per-edge distribution.

The hypothesis that many reactive graphs are sparse/skewed is plausible but **not established for the joint per-edge `(in, out)` distribution of real Reflex applications**. The normal benchmark suite's zero generic-lookups is a limitation of that suite, not proof that real applications have none. Any “effectively constant-time in practice” claim needs a representative trace of `P50/P95/P99 D_e`, the fraction of off-sequence reads, and actual traversed links per read.

### After PR #52: repeated pairs and the outgoing hint

_This part describes the follow-up branch `perf/tracking-producer-hint`, not PR #52._

**The case the joint-tail study did not measure.** The study above shuffles reads. A more common way to reach the lookup with two wide endpoints is a _repeated_ pair: a wide consumer re-reads one broad producer between its other reads, as in `items.map((i) => f(i, theme()))`. Every re-read after the first is a duplicate. Its edge lies `i` reads behind the cursor in the accepted prefix and at rank ρ in `P.out`; when the consumer's edge sits in the middle of the producer's list, the newest-outgoing probe misses, each duplicate costs `O(min(ρ, i))` and a pass `Θ(n · min(ρ, n))`. On the PR #52 code, with 512 items and the consumer in the middle of 1,024 subscribers, one pass compared 329,713 links and took about 400 µs, against 2.9 µs for the same reads without the duplicates; with 16 subscribers it compared 8,664 links (15 µs). No `bench/` workload had this shape.

**Why searching cannot do better on the PR #52 representation.** The stamp already classifies a duplicate in O(1) once the edge is in hand (INV-T3); the missing step is `P → e(P, C)`. In the PR #52 shape, without auxiliary state:

- a pointer path from `P` to `e(P, C)` runs through `P.out`, one from `C` through `C.in`;
- the writable state reachable from `P` without a search is `P`'s own fields, each under an existing contract, and the edge itself;
- the stamps of idle consumers' edges could be rewritten, but integers cannot shorten a walk over a linked list; the order of `C`'s suffix is free in a successful pass, but it is reachable only from `C` and cannot be keyed by producer, since JavaScript objects have no order or hash without an auxiliary map.

So any procedure that locates the edge, or merely certifies that the read is a duplicate, examines `Ω(min(ρ, δ))` links in the worst case, `δ` being the distance from the cursor in `C.in`. As in §5, this is a statement about this access model, not a universal lower bound.

**INV-H: one slot, two lifetime-disjoint readings.** The model is changed by giving an existing slot a second reading, not by adding a field. The frontier reading of `tailIn` is required only while the node is `Computing`. Outside that phase the slot is semantically inactive, and the lookup reuses it as a producer-side hint:

> For a node that is not `Computing`, `tailIn` is null, the residual incoming edge of its last pass, or a **hint**: one of its own outgoing edges, attached to both lists, with `from === node && to !== node`.

An incoming edge has `to === node`. The graph does not forbid self-edges, so `from === node` alone would not tell the readings apart; with `to !== node`, a self-edge always reads as incoming and is never written as a hint. Maintenance keeps the reading exact:

1. The lookup writes a hint only past its four-link outgoing head start, only into a node that is neither `Computing` nor a watcher, and only with the edge it has just located.
2. Every unlink path (`unlinkEdge`, `unlinkDetachedIncomingEdgeSequence`, `unlinkAllSubscribers`) clears the hint that points to the unlinked edge.
3. Every computation resets `tailIn` to null before its first read, so the slot is never a hint when it becomes a frontier.
4. The idle uses of `tailIn` (repair of an incoming cursor on unlink, the debug integrity check, watcher validation's save and restore, which only watchers reach) either accept a hint or never meet one.

The lookup uses the slot only for exactly its pair (`hint.to === C && hint.from === P`): whatever the slot holds is attached, whichever reading it is in, and a pair has at most one edge. The fill writes only into a node that is neither Computing nor a watcher; a self-read comes from the computing consumer itself, so no self-edge is written, and the two self-edge guards an earlier draft carried were equivalent mutants. A hint is a positive answer only: a missing or foreign hint proves nothing, absence is still proved by the lockstep, and the hint carries no semantics of its own.

**Three lookup levels.**

| Level | Mechanism                                                                                                                | Memory        | Settles                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| L0    | consumer side: cursor, next edges, physical tail of `C.in`                                                               | none          | stable and local reads                                                                                                          |
| L1    | producer side: empty `P.out`, newest edge, sole edge, the hint (`tailIn` of an idle producer), then four-link head start | existing slot | edges linked in this pass, bounded fan-out, and a pair looked up before until another lookup of that producer replaces its hint |
| L2    | lockstep, `findEdgeInLockstep`                                                                                           | none          | every read; the only general proof of absence                                                                                   |

In code, L0 lives in the three miss handlers of `resolve.ts`, and every miss kind ends in one call, `locateTrackedEdge` (`locate.ts`), which runs the producer-side probes and then `findEdgeInLockstep` (hint, head start, lockstep, refresh). Until `perf/tracking-hint-first` the hint came after the head start; see _Hint before the head start_ below.

After the first lookup of a pass, every further duplicate of the hub costs one comparison: `P → e(P, C)` in O(1). The hint is not an index: one slot per producer, written only by a lookup that has already paid L2, never prepared or restored around a pass (compare Preact's `_node` and Vue's `activeLink`, §8), never allocated. The lazily armed slot of the study above remains rejected: arming builds a temporary per-pass index; the hint remembers the last answer.

**Evidence.**

- _Graph-level differential fuzz._ `scripts/fuzz-tracking-graph.mjs` executes seeded scripts on the pre-change bundle and the candidate: tracking passes in order, shuffled and with hub duplicates, new and dropped dependencies, self-reads, reads of a consumer that is itself computing, passes nested in passes, passes that end without cleanup, single unlinks, source and subscriber sweeps, disposals. It compares the frontier after every read and the whole graph after every operation, with edge identity and exact stamps, and checks INV-H on the candidate after every read and operation. 200,000 scenarios of 30 operations against `69704b8`: identical, INV-H held, a live hint at the end of 94% of them. `--qualify` kills all nine seeded mutants (pair check ×2, the Computing and watcher guards of the fill, the three unlink clears, two in the locate stage). Two guards of an earlier draft, `consumer !== producer` in the probe and in the fill, survived as equivalent mutants and were removed.
- _Exactness in unit tests._ A property test runs two identical worlds through random passes, unlinks and disposals; the reference scrubs every hint before each read, so each lookup is decided by the lockstep alone. Incoming and outgoing order and stamp classes stay identical and INV-H holds after every operation; the test fails when any unlink path keeps its hint.
- _Oracle._ The differential oracle records the semantic tail of every running computation (its accepted prefix, `firstIn` through `tailIn`) and compares it with the baseline; an idle node's `tailIn` is not compared, since a hint may replace its residual edge. The invariant oracle checks INV-H after every operation: a Computing node's `tailIn` is incoming, an idle node's is incoming or an attached, non-self outgoing hint, never on a watcher. A hub program family, kept out of the default generator so its pinned seeds are unchanged, re-reads a producer hub and a computed hub inside wide consumers under conditional reads, throws, disposal and context switches; the mutant `hint-keep-on-unlink` is killed. The invariant checker's F14 exemption now also covers a node disposed during its own execution when that execution throws, as its contract already stated; the pre-change code violates it on the same five hub programs. At the CI budget (2,000 default and 1,000 hub programs) every check passes. At 50,000 default and 20,000 hub programs, the candidate and the pre-change commit, built by the same toolchain, produce identical traces on 139,999 of 140,000 program-level pairs; the one difference is the depth at which a program that recurses through hook actions overflows the stack, which depends on frame sizes. At that scale the differential and invariant oracles also report three program classes, each reproduced identically by the pre-change commit, so they predate the branch: an unclassified baseline delivery divergence (seed 2380), a liveness violation after a stack overflow (seed 4218) and a sources check after a re-read of a disposed node (hub seed 2301). In PROFILE builds the hub programs compare 66,650 lockstep links instead of 73,476, the default programs 4,217 in both: bounded fan-out never passes the head start, so it never touches the slot.
- _Machine code._ In the production bundle `resolveTrackedRead`, `isEdgeInTrackedPrefix`, `reconcileTrackedRead`, push, `advanceCore`, `executeComputation` and the link functions are byte-identical. The three miss handlers end in one call, `locateTrackedEdge`; `findEdgeInLockstep` carries the head start and the hint, `findEdgeInLockstepPastHeadStart` the lockstep; the three unlink functions clear hints. Per-function TurboFan instruction counts under Node 24.22 (`perf/v8-shape`): unchanged on `A.track.stable-8`, `A.watcher.rerun` and `B.diamond.layers-8x8`; fewer on `A.track.hub-duplicate` (2,582 → 2,308), `A.track.reorder-128-shuffled` (2,429 → 2,026), `A.graph.append-shared-64` (1,837 → 1,579) and `D.subtree.mount-unmount` (6,169 → 6,025); more on `D.list.filter-select` (4,756 → 4,904: `locateTrackedEdge` and the append are now inlined into `resolveTrackedRead` and `readConsumer`) and `A.graph.swap-pairs-fanout-3` (1,336 → 1,388). The unlink loop gains one load and compare per edge.
- _Paired CI_ (24 replicates per workload, A against B and A against A' in every replicate). The first version of the branch (`2b77ee5`, before the locate stage) against `69704b8`, [run 40135499265](https://github.com/volynetstyle/Reflex/actions/runs/40135499265): `A.track.hub-duplicate` faster by 66% ([−66.4%, −65.7%]); no workload slower; `D.subtree.mount-unmount` +2.3% ([+1.4%, +4.7%], inconclusive at the 3% threshold); the mirrors of the tracking-graph scenarios that drifted locally are equivalent, `A.graph.append-shared-64` inconclusive with wide intervals on both sides. A/A calibration on the same commit, [run 40136325548](https://github.com/volynetstyle/Reflex/actions/runs/40136325548): 29 equivalent, 3 inconclusive, nothing faster, slower or invalid. Attribution, two unsound variants against `2b77ee5`: without the unlink clears `D.subtree.mount-unmount` is 2.7% faster ([−3.6%, −1.5%]); without the probe and fill it is equivalent, and `A.track.hub-duplicate` is 225% slower. The mount-unmount cost is therefore the exact maintenance of INV-H on unlink, one read of the producer's slot per removed edge; it is kept, since validating at the probe instead would let a detached hint retain a consumer. The final branch, locate stage included, against `main`: pending.
- _Timing, local._ `compare-tracking-graph.mjs` (independent processes alternating, nine samples, medians; a Windows laptop, not the CI runner): `hub-duplicates-16` 2,542 → 1,636 ns per pass (1.55×), `hub-duplicates-256` 15,164 → 1,743 ns (8.7×), `long-long-single` 9.2×, `long-long-8-nested` 1.36×, `permuted-fanout-8-mid` 1.13×; the interleaved long × long modes 0.94–1.09 at 300 iterations. Four scenarios measured 0.92–0.95 locally (`runtime-reorder`, `reuse-first-out`, `append-shared-64`, `swap-pairs-fanout-3`); their paired mirrors settled them as equivalent or inconclusive in CI, so the local ratios were process-to-process drift.

**What stays at the bound.**

- _Interleaved dense-core churn._ Wide consumers that reorder their reads of the same wide producers in turn overwrite one another's hints, so their lookups stay at L2. Closing this needs per-pass arming of an index (`Θ(in(C))` writes and a trigger heuristic), which is not done.
- _Absence._ A new dependency between two wide endpoints needs a proof of absence, which no positive hint gives; without a complete index this is the bound in any representation.

For both the remaining cost is topological. Over a round in which every consumer re-tracks once, Chiba and Nishizeki's bound `Σ_e min(deg u, deg v) ≤ 2·α(G)·m` (α the arboricity, m the edge count) limits the lockstep to `2α` links per read on average. By Nash-Williams, arboricity is set by the densest subgraph: what keeps lookups expensive is a dense bipartite core, not a single wide hub, and such a core already holds `Θ(s·t)` edges. For the 64 × 512 core of the joint-tail study, the Nash-Williams ratio of the whole core, ⌈32768/575⌉ = 57, is a lower bound on α (its exactness would need that subgraph to be the maximizer, which is not claimed here); the measured 69–75 links per lookup are of that order. The bound is aggregate: one consumer that re-tracks often can still pay `Θ(n · min)` per pass in a graph of low arboricity, which is the repeated-pair case L1 closes as long as that consumer is the one looking those producers up.

The landscape after the hint:

| Read                               | Cost                                 | Level |
| ---------------------------------- | ------------------------------------ | ----- |
| stable or local                    | O(1)                                 | L0    |
| repeated pair                      | O(1) after its first lookup          | L1    |
| irregular pair between sparse ends | O(min(out, in))                      | L2    |
| dense-core churn                   | representation bound, ≤ 2α amortized | L2    |
| absence                            | representation bound                 | L2    |

**Hint before the head start** (branch `perf/tracking-hint-first`, on `296cbba`). The tracking degradation ladder (`scripts/tracking-ladder.mjs`; `perf/tracking-ladder/analyze.mjs` replays every lookup and fails unless the replay matches the PROFILE bundle's compared links and outcome) showed that a hint hit first walked the four-link head start: on a hub re-read inside a 128-wide consumer with 128 subscribers per producer, 1.99 links per read before a hit that needs none. The probe now comes first. The fill stays past the head start and the probe is exact, so answers and slot states are unchanged in both orders and the counterfactual is exact. Counted on the ladder at D = 128: every hint hit saves its head-start links (hub repeat 1.99 → 0 links per read, bounded reorder 0.41 → 0, single-consumer shuffle 3.47 → 0); a lookup that bounded fan-out settles pays one extra load and compare (0.5–0.9 per read on the fan-out-3 rungs). Production bundle: only `findEdgeInLockstep` changes. TurboFan under Node 24.22 (`perf/v8-shape`, readable bundles): `resolveTrackedRead` has the same instruction count on every L0 rung; `findEdgeInLockstep` 290 → 175 instructions on the wide rungs; on `A.track.hub-duplicate` `resolveTrackedRead` 378 → 304, since the smaller callee is inlined; no other runtime function changes in the timed workloads. Local timing (one process per sample, case and bundle, seven samples, Node 24.22, Windows laptop without layout randomization): 0.79–0.92 of the previous time on the rungs where the hint answers, 0.96–1.06 elsewhere, which is inside this runner's placement noise. Paired CI (24 replicates), `296cbba` against the merge result of #56, [run 40188163623](https://github.com/volynetstyle/Reflex/actions/runs/40188163623): `A.track.hub-duplicate` faster by 19.4% ([−19.6%, −19.2%]); `A.track.reorder-128-shuffled` and `A.graph.swap-pairs-fanout-3` equivalent; `A.graph.reuse-first-out` +2.1% ([+1.1%, +3.8%], inconclusive at the 3% threshold), the extra slot load on the one path where fan-out 1 reaches `findEdgeInLockstep` (the exported default strategy, which has no newest or sole probe; the resolver settles fan-out 1 in `locateTrackedEdge`); `A.track.stable-8` inconclusive by its position effect (Δ 0.0%); every other workload equivalent, `A.graph.append-shared-64` and `B.chain.depth-1000` inconclusive as before. A/A calibration on `ad68c28`, [run 40189188365](https://github.com/volynetstyle/Reflex/actions/runs/40189188365): 29 equivalent, 3 inconclusive, nothing faster, slower or invalid.

## 10. Failure modes in _reading_ the implementation

The following statements are misleading or false for the scoped PR:

1. **“`edge.stamp` tracks whether a producer value changed.”** False. It stamps read membership. Dirty-state transitions and pull validation address changes.
2. **“The algorithm is a bounded 32-edge suffix scan.”** Outdated. The number 32 now governs eager detachment, not pair lookup.
3. **“Every tracked read searches two lists.”** False. Sequential, duplicate, head, lookahead, and tail paths bypass generic lookup.
4. **“A pair is represented by a fresh edge on each evaluation.”** False for normal reuse; exceptions exist for deliberately detached edges.
5. **“Edge identity is always preserved.”** Also false. Eager detachment and later relinking can replace an edge, changing outgoing order.
6. **“The stamp test alone finds `(P, C)`.”** False. First locate the edge; then classify its membership. The stamp is not a pair index.
7. **“`O(min(in, out))` is a universal lower bound.”** False. It is a worst-case bound for the specific unindexed, unsorted adjacency-list access model.
8. **“The resolver reorders arbitrary consumer reads transactionally.”** False. Mutations are incremental, and failures do not roll back graph changes.
9. **“Watcher validation requires current stamps on every edge.”** False. Its completed-frontier case is covered by physical `tailIn === lastIn` (INV-T2).
10. **“The new algorithm proves all reactive graphs have small degrees.”** False. It avoids the large-degree cost unless **both endpoints** are wide on an off-sequence read; empirical joint-degree distributions remain unmeasured.
11. **“The new resolver's improvements explain all Reflex benchmark results.”** False. General CI workloads often never invoke the new lookup at all.
12. **“This design is the same as lite-signal's per-edge versioning experiment.”** False. The latter concerns value/dependency change information; Reflex's edge stamp concerns temporal membership.
13. **“`tailIn` always belongs to the incoming list.”** True for PR #52. On the follow-up branch only while the node is `Computing`; outside that phase it may be an outgoing hint (INV-H), and a hint is a lookup answer, not a frontier.

## 11. Reproduction and falsifiable next questions

**Pin the tested revision.** `main` carries the squash `190a09e`. On the PR branch, track separate changes: PR #52's preparatory JIT-hint baseline (`ee07a7b`), production tracking change (`e4af48e`), profiling/research tools (`1d10594`), and later documentation-only fixes (`752f7d7`, `1cca2bc`). Do not attribute every JIT-related edit in the PR to the lookup rewrite.

**Run the targeted harness** according to [`tracking/README.md`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/kernel/shape/tracking/README.md) and [`compare-tracking-graph.mjs`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/scripts/compare-tracking-graph.mjs). Separate PROFILE link counts from production timings: instrumentation changes traversal costs and must not be used for runtime-speed claims. [`analyze.mjs`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/perf/tracking-pair-lookup/analyze.mjs) and [`tracking-long-long.mjs`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/scripts/tracking-long-long.mjs) document the joint-tail experiment.

The repeated-pair case of the follow-up branch is measured by `hub-duplicates-16` and `hub-duplicates-256` in `compare-tracking-graph.mjs` and by the paired workload `A.track.hub-duplicate`.

Good falsifiable questions for further research are: What are the **read-weighted** joint degrees in real applications? How often do conditional computations reorder reads beyond locality tiers? At what measured `p`, `D`, nesting level, and graph density does a lazily armed slot repay its memory and preparation costs? Can identity-changing eager detachment be revised **as a deliberately separate semantic change** with a new differential oracle, rather than smuggled into a search optimization?

## Source map

- [PR #52](https://github.com/volynetstyle/Reflex/pull/52) — revision, summary, commits and reported tests.
- [`tracking/resolve.ts`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/kernel/shape/tracking/resolve.ts) — read fast paths and cold resolution.
- [`graph/findEdge.ts`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/kernel/shape/graph/findEdge.ts) — exact bidirectional lookup.
- [`tracking/prefix.ts`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/kernel/shape/tracking/prefix.ts) — prefix certificate and stamp-zero fallback.
- [`graph/reuseEdge.ts`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/kernel/shape/graph/reuseEdge.ts) — reuse, link, and eager detachment.
- [`state.ts`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/kernel/state.ts) — active consumer and monotone epoch.
- [`push_iterator.ts`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/src/kernel/stages/propagation/push_iterator.ts) — reentrant propagation using prefix evidence.
- [`INVARIANTS.md`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/docs/INVARIANTS.md) and [`KERNEL_AUDIT.md`](https://github.com/volynetstyle/Reflex/blob/1cca2bc04aadfcb42bde41d5c70df6ed202a16d7/packages/reflex-runtime/docs/characterization/KERNEL_AUDIT.md) — contracts, execution, and historical comparison.
- [Paired CI run](https://github.com/volynetstyle/Reflex/actions/runs/40110256686) — controlled performance regression check.
- [lite-signal LEDGER, #14](https://github.com/PeshoVurtoleta/lite-signal/blob/e940fd9f06a4209f1ab2328cfdef20f6bc4e1623/LEDGER.md) — independently documented distinction between tracking stamps and per-edge value versioning.

---

**One-sentence model:** Reflex does not infer value freshness from an edge's version; it uses a cursor to exploit read-order locality, two intrusive adjacency views to locate the unique pair edge, and a pass stamp to classify the edge relative to the accepted temporal frontier, then reconciles structure under an explicitly identity-sensitive policy.
