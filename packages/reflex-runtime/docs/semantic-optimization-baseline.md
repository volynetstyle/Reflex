# Semantic optimization baseline

Recorded 2026-09-11 from the reactive-kernel analysis immediately preceding the suffix-preservation experiment. This is the **pre-experiment semantic baseline**, not a claim that every hypothesis has been validated. No runtime code was changed during that analysis. Source references below are package-relative and refer to the pre-patch source; line numbers may subsequently move.

The largest proven opportunity is avoiding dependency-list scans and edge destruction when the requested producer has no outgoing edges. The fallback can recreate a large, unchanged dependency suffix after one dependency changes. Smaller provable redundancies exist in tracking and cleanup. The analysis did not establish a safe basis for removing general dirty-state, computing, scheduling, or post-callback disposal checks.

Validation at baseline: source inspection plus three small probes transpiling current TypeScript into memory. These validate execution traces, not production timing. The subsequent experiment is documented separately in [the experiment README](../perf/suffix-preservation/README.md).

## Scope and terminology

| Requested name | Implementation analyzed |
| --- | --- |
| Invalid | Unknown |
| propagation | pushIteratorCore / push_iterator |
| walkLine / walkBranch | No such functions in checkout; direct-edge phase, transitive DFS, and pull walker analyzed |
| propagateOnceFromEdge | pushIteratorOnceCore and pushIteratorOnceSkippingCore |
| trackReadResolved | resolveTrackedRead |
| refresh / recompute | stabilizeDirtyConsumer, pullIteratorCore, advanceCore |
| ExecutionContext | Module execution registers, RuntimeContext, development phase state |
| Disposed | No flag; watcher disposal represented primarily by compute === undefined |

Proofs distinguish ordinary protocol execution from the larger internal API. The internal entry point exports graph primitives, state setters, and context restoration. Constructor/normal-tracking invariants cannot automatically be applied to every internal caller. Unless stated otherwise, production proofs assume ordinary node objects, valid linked lists, and a tracking strategy respecting its structural contract. Facts crossing arbitrary callbacks receive narrower guarantees.

## Findings ordered by confidence and expected impact

### 1. FACT: proven edge absence still leads to suffix search and destruction

**Location:** `src/kernel/shape/graph/reuseEdge.ts`, first-outgoing-edge probe in `reuseIncomingEdgeFromSuffixOrLink` and `reconcileIncomingSuffix`.

**Observed:** `producer.firstOut === null` records a miss and continues scanning the consumer suffix. At 32 scanned edges, an outgoing search confirms absence, detaches the suffix, and links the new edge.

**Invariant / proof:** Every attached dependency belongs to both its producer's outgoing list and consumer's incoming list. Empty outgoing list proves absence from both prefix and suffix. Stale incoming edges remain attached to producers until removal.

**Counterexample attempt:** A consumer-only edge defeats the proof but violates the two-list graph invariant.

**Reentrancy:** No user callback in the production interval between default-strategy probe and reconciliation. Optimize inside the default strategy; do not bypass custom strategy semantics.

**Redundant work:** Suffix search, second absence search, premature unlinking, potential recreation of unchanged edges.

**Minimal proposal:** Direct `linkEdge` at the supplied insertion point on empty outgoing list, preserving suffix for subsequent reads and final cleanup.

**Expected:** Eliminate search/destruction in this case. **HYPOTHESIS:** highest-value proven candidate; timing unmeasured at baseline.

**Benchmark:** Alternate one dependency before stable suffix lengths spanning 32; include full branch replacement.

Baseline in-memory trace `selector, alternatingDependency, stable[0..63]`: on three alternating passes, old edges 66, new edges 66, retained edges 1, retained stable edges 0. Final dependency set changed by one removal and one addition, but all 64 stable edges were recreated. This proves recreation; it does not prove that preserving them eliminates all incoming-list moves.

### 2. INFERENCE: repeated cursor handling and unchanged version writes

**Location:** `protocol/read.producer.ts`, `protocol/read.consumer.ts`, `shape/tracking/resolve.ts`.

**Observed:** Caller reads `tailIn` to derive version; resolver reads it again. Cursor duplicate writes supplied version back to the same edge.

**Invariant / proof:** Protocol argument is `consumer.tailIn?.version ?? trackingEpoch`. With non-null cursor, version equals cursor version; there is no intervening production callback. Cursor-hit assignment writes existing value.

**Counterexample:** Direct internal resolver call may supply another version; global removal invalid.

**Reentrancy:** Capture after consumer stabilization, which may execute callbacks. Local interval is callback-free.

**Work:** Repeated cursor load/null decision and unchanged version write.

**Proposal:** Protocol-specific cursor-derived version handling; omit duplicate version store there, retain explicit-version internal semantics.

**Expected / benchmark:** Constant-factor tracked-read reduction; duplicate bursts and stable traces; inspect generated code. **HYPOTHESIS:** frequency may matter more than smaller branch removals; no timing claim.

### 3. INFERENCE: last-edge adjacency guard always true

**Location:** `shape/tracking/resolve.ts`, `previousLastEdge !== cursorEdge` in last-edge shortcut.

**Proof:** Expected next-edge producer match already failed; expected edge is non-null. Last-edge producer now matches. If last.prevIn equalled cursor, last would equal expected, contradicting the rejected match.

**Counterexample / mutation:** Reordering between tests could defeat it, but no production callback occurs there; arbitrary development instrumentation mutation excluded.

**Work / proposal:** Remove identity comparison and branch only. **Effect:** small, successful tail shortcut only. **Benchmark:** repeated last-edge selection with tracking tier enabled. Classification B, supported by D/E.

### 4. INFERENCE: callers prove nonempty stale cleanup

**Location:** `stages/second/advance.ts`, `engine/watcher.execution.ts`, `shape/tracking/cleanup.ts`.

**Proof:** Callers require `tailIn !== lastIn`. Null tail then implies nonempty list; non-null non-last tail has non-null nextIn. Cleanup's empty-edge test is false.

**Counterexample:** Detached cursor breaks invariant; normal unlinking adjusts cursor. No production callback between caller guard and cleanup.

**Work / proposal:** Avoid second empty test and repeated suffix selection by passing known nonempty suffix or using a narrow cleanup entry.

**Effect / benchmark:** Small cost per shrinking recomputation; test shrink by one and large suffix. Classification C/D/E at callers, A for general function.

### 5. INFERENCE: default fallback repeats rejected suffix-head match

**Location:** tracking resolver slow path and `reuseIncomingEdgeFromSuffixOrLink` first match.

**Proof:** Initial/cursor misses already reject producer identity on the exact supplied suffix head. Default fallback repeats it without a preceding production callback.

**Counterexample:** Direct strategy calls may hit; custom strategy is not interchangeable.

**Work / proposal:** Known-miss default entry only if choosing it does not add equivalent per-read dispatch work.

**Effect / benchmark:** Small on dynamic fallback traffic; include custom-strategy controls. Classification C/D for known path, A generally.

### 6. FACT: saturated writes still scan direct fanout

**Location:** `stages/first/push_iterator.ts`, direct loop.

**Observed:** Every unequal write scans outgoing edges before dirty cutoff. Without reads, topology changes, or reentrant execution, directly Changed ordinary consumers remain blocked on later writes.

**Counterexample:** Reads clean destinations; newly attached destinations need invalidation. Producer-level saturation does not survive without maintenance.

**Work:** Repeated visits with zero additional invalidations.

**Proposal:** None justified. **UNPROVEN:** marker maintenance/correctness yields net benefit. Potential removable work O(N * directFanout). Benchmark many writes before reads with interleaved-read controls.

## State-transition model

Notation: U Unknown, C Changed, V Visited, K Computing, W Watcher, S Scheduled. DIRTY_STATE is mask U|C, not another logical state.

**FACT:** Watcher initialization is U|C|W. The comment claiming mutually exclusive dirty bits is not globally true.

| Entity/pre-state | Operation | Post-state |
| --- | --- | --- |
| Producer initialized | Equal write | Same value/state, no propagation |
| Producer initialized | Unequal write | New payload; own flags not rewritten; downstream propagation |
| New consumer | Construct | C, no dependencies |
| Clean noncomputing consumer | Direct push | C, V cleared |
| U non-watcher | Direct push | C, U/V cleared, other bits retained |
| Clean noncomputing consumer | Transitive push | U, V cleared |
| Dirty noncomputing consumer | Transitive push | Unchanged, descent stops |
| Computing destination/current eligible edge | Computing helper | Existing state OR U|V |
| Computing destination/stale suffix or null cursor | Computing helper | Unchanged |
| Dirty consumer | Enter advance | Dirty retained, V cleared, K set, cursor null |
| Computing consumer | Successful advance | Dirty/K/V cleared from saved entry state; payload equal or replaced |
| Computing consumer | Compute throws | C; K/U/V cleared from saved state; partial trace retained |
| New watcher | Construct | W|U|C |
| Unscheduled watcher | Claim | S added |
| Scheduled watcher | Claim | Unchanged, false |
| Watcher | Release claim | S cleared |
| Clean watcher | Run | Skip |
| U watcher without C/V | Run | Pull; stable skip or proceed |
| Dirty executable watcher | Execute | K during callback, cursor reset |
| Successful watcher without V | Finish | Dirty cleared |
| Successful watcher with V | Finish | U|V retained, C cleared |
| Watcher body/cleanup throws | Recover | U/C/V/K/S cleared, dependencies retained |
| Watcher | Dispose | Edges/compute/payload cleared before cleanup, transient bits cleared |
| Disposed watcher callback still active | Tracked read | Can attach edge despite undefined compute |

Probe: first watcher body state 27 = W|K|C|U; self-write gives 31 = W|K|V|C|U; finish gives 21 = W|V|U. Self-dispose followed by producer read finishes with undefined compute, state W, one incoming edge.

**FACT:** Tracking is runtime state, not node state. Visited may persist after watcher execution. Scheduled is ownership, not dirty/alive. Production Producer/Consumer constants are zero; development constants share one bit, so those flags cannot recover role.

**INFERENCE:** Ordinary producer protocol keeps sources clean/noncomputing; internal setters can defeat this. Consumer advance derives final state from saved computingState, not arbitrary live callback changes; watcher finish examines live state.

### Impossible combinations and explicit non-impossibilities

| Combination | Status/scope |
| --- | --- |
| Ordinary source actively computing | Impossible through typed producer protocol |
| Successful advance returns K set | Impossible before later mutation |
| U and C | Reachable, initialization/computing invalidation |
| V without K | Reachable, self-invalidated watcher |
| S and clean | Reachable, low-level claims |
| S and disposed | Reachable by claims; disposal itself clears S |
| currentConsumer non-null, Tracking absent | Impossible under balanced normal registers; not arbitrary restoration |
| K with null currentConsumer | Reachable in untracked |
| Non-null currentConsumer, disposed consumer | Reachable during self-disposal |
| Incoming attached edge absent from producer list | Impossible under graph invariant |
| tailIn non-null, firstIn null | Impossible under incoming-list invariant |
| tailIn == lastIn and tailIn.nextIn non-null | Impossible under incoming-list invariant |
| Disposed with attached edges | Reachable, not itself a list-integrity violation |

## Edges and cursor

During a valid pass, `[firstIn ... tailIn]` is current prefix; `[tailIn.nextIn ... lastIn]` is unvisited old suffix. Initial tail null means whole old list unvisited.

| Operation | Transition |
| --- | --- |
| First/next hit | Old attached -> current attached; version/cursor updated |
| Cursor duplicate | Same current edge/cursor |
| Prefix duplicate | Same earlier current edge, cursor unchanged |
| Reorder | Suffix edge -> current boundary; incoming pointers changed |
| New dependency | Absent -> attached in both lists |
| Final cleanup | Unvisited suffix -> incoming-detached -> producer-unlinked |
| Disposal | Attached edges -> detached |
| Compute failure | Partial prefix and suffix remain attached; no final cleanup |

**INFERENCE:** Non-null cursor does not imply currently active tracking; cursor remains after execution.

**UNPROVEN:** Version equality universally proves current-pass membership across arbitrary setters, context restores, wraparound and custom strategies. Structural proofs above do not need that assertion.

## Execution context

Idle -> tracking sets currentConsumer/Tracking; propagation sets depth/Propagating; batching sets batchDepth/Batching. Dimensions coexist. untracked clears currentConsumer/Tracking temporarily, not node K. Nested computation restores consumer but not previous global epoch; cursor version supplies the existing pass version once a prefix exists.

runWithRuntimeContext saves/loads registers and restores previous context in finally. Context objects need not continuously mirror live registers. Development phase state is separate; scheduler-policy enforcement is gated by __DEV__ && __PROFILE__, not a production impossibility proof.

## Abstract interpretation at program points

| Point | MUST | MAY | Excluded / unavailable conclusion |
| --- | --- | --- | --- |
| After unequal payload write | Value committed | No subscribers, nested scope, later idle callback | Cannot promise no callback before public return |
| Push clean arm | Sampled !(U/C/K) | W/V/S | Flags do not prove alive |
| Direct U non-watcher arm | U and !W | K/V/C | Not noncomputing-only |
| Computing helper | Sampled K | Null cursor/current/stale edge | Cannot assume edge already read |
| Transitive blocked arm | Dirty or computing | Existing invalidation | May have outgoing edges |
| One-step loop | Non-null pointer | Clean/U/C/K/W | Not universally Unknown |
| Clean read arm | Dirty mask zero | Tracking | Stabilization callback unnecessary |
| Dirty stabilizer | Sampled dirty | Force or pull | Clean sampled input excluded |
| Pull after advance | Callback returned | Parent/topology changed | Saved attachment/state unavailable |
| Adjacent clean scan | Dependency clean, no compute in segment | Clean siblings/dirty boundary | No spontaneous production mutation |
| Resolver cursor branch | Cursor exists | Expected edge or completed prefix | Empty incoming excluded |
| Resolver next hit | Producer matches | Old version | Store generally required |
| Protocol cursor hit | Producer/version match cursor | Duplicate | Different supplied version excluded |
| Initial miss | First exists/mismatches | Last shortcut/fallback | Empty/matching head excluded |
| Guarded cleanup | Nonempty suffix | Full list/proper suffix | Empty excluded |
| Watcher after cleanup | Cleanup returned | Disposed | Entry alive no longer sufficient |
| Watcher after body | Body returned | Disposal/V/new cleanup | Entry snapshots insufficient |
| Dispose after sweep before callback | Compute undefined, lists empty now | Cleanup pending | Empty lists need not survive callback |

## Conditional inventory

A necessary; B always true; C always false; D caller guarantee; E structure guarantee; F unproven. Repeated termination/feature tests grouped. Class applies to a program point, not an expression globally.

| Function / conditions | Classification |
| --- | --- |
| write equality, firstOut, scope depth | A |
| Push edge termination, FAST_BLOCK_MASK, U&&!W, Computing, next zero/nonzero | A |
| Push watcher/hook, child/sibling, stack/base/capacity | A |
| Computing helper cursor null, edge==tail, backward null/tail | A |
| One-step Changed, skip termination, suffix termination | A |
| Skipping current null before skip | A general; F removal from advance |
| Read mode, dirty, currentConsumer | A |
| Read cursor/version fallback | A general; repeated protocol work finding 2 |
| Stabilizer C|V | A |
| Stabilizer firstIn non-null | F removal under disposal/internal mutation |
| Stabilizer pull/advance result, !stabilized clearing | A general; clearing sometimes repeats prior clearing |
| Pending-idle caller gate | A |
| Flush pending bit | D immediately gated caller, A other callers |
| Flush tracking/propagation/batching blocker | A |
| Resolver cursor/expected/producer, completed-prefix absence/sole-edge | A |
| Resolver lookahead existence/match, last producer | A |
| Last previousLastEdge != cursor | B/D/E, finding 3 |
| Resolver prefix membership | A |
| !allowSlowPath | C/D protocol callers passing true; A exported resolver |
| Initial empty/first-hit | A |
| Prefix bounded null/match/limit, outgoing existence/target/version | A general |
| Completed-prefix entry non-null/multi-edge facts | D resolver caller; subsequent null tests A |
| Prefix nonzero version | A general; global removal F |
| Default suffix-head match | C/D resolver path; A general |
| Default outgoing/version probe | A; absence underused |
| Reconcile match/threshold/outgoing lookup/version | A under current algorithm |
| Scanned candidate already at insertion | C/E valid nonempty suffix scan after rejected head; A generic cases |
| Eager-detachment threshold | A current policy; demonstrated amplification |
| Generic move no-op/head/tail/insertion tests | A general; stronger global removals unproven |
| Cleanup empty suffix | C/D/E guarded callers; A general |
| Cleanup null cursor | A |
| Unlink neighbor/tail tests | A |
| Advance cursor != physical tail, equality, firstOut | A |
| Advance skip presence | A general; D distinct pull/direct-read paths |
| Advance sole edge skip | A |
| Pull parent Changed | A after callbacks; C/D some unknown-only entries |
| Pull dep C/U, unknown inputs, clean-scan dirty | A general |
| Generic sibling after adjacent-clean exhaustion | C/E on that predecessor; A after unchanged advance |
| Pull bubbling/stack/sibling | A |
| Watcher clean/force | A |
| Watcher verification input/result | A/F removal with general mutation |
| Watcher undefined compute after verification/cleanup/body | A; each callback boundary can dispose |
| Watcher previous/returned cleanup, Visited | A |
| Schedule claim Scheduled | A |
| Cleanup null context, disposal function cleanup | A |

Additional proof chains: gated pending-idle caller reads live bit and immediately calls flush without callback, so same pending test is redundant, not blockers. Adjacent-clean loop exhausts only with null sibling; no callback precedes generic sibling check, so that predecessor can go directly to stable bubbling. Unchanged-advance predecessor cannot.

Build constants __DEV__, __PROFILE__, tracking tiers are B/C once fixed; not automatically runtime optimization candidates. Profile-only degree walks are excluded from production cost.

## Function contracts

Supported structural execution; callbacks may perform nested operations/disposal/custom strategies/host work.

| Function | Requires | Guarantees | Preserves | May invalidate |
| --- | --- | --- | --- | --- |
| writeProducer | Producer | Equal skips; unequal commits then pushes | Own flags in body | Downstream cleanliness, callbacks more |
| Push | Valid outgoing traversal/hook contract | Accepted direct/transitive invalidation; stack released | Structure absent mutation | Destination state/queue via hooks |
| Computing helper | Sampled K, valid position | Zero for suffix/null cursor, else U/V | Structure | Flags |
| One-step | Valid outgoing sequence | Encountered non-C -> C | Structure absent hooks | State/scheduling |
| Skipping | Sequence/skip | Promotion except skip; return if end first | Same | Skip attachment across callbacks |
| readProducer | Producer | Captured value; tracking if active | Payload absent callbacks | Dependencies via strategy |
| readConsumerLazy | Consumer executable if needed | Stabilize then track in restored context | Balanced tracking | Graph/value/state/host work |
| readConsumerEager | Same | Stabilize, no final dependency | Same | Same |
| resolveTrackedRead | Valid cursor/list/version/strategy | Reconcile, or false if fallback blocked | Identities/two-list invariant with valid strategy | Order/cursor/version/allocation |
| cleanup | Valid split | Remove suffix | Current prefix | Attachment/outgoing lists |
| Pull | Valid parent/input, executable deps | Need-recompute boolean; stack restored on return/throw | Callback-free clean segment state | Saved graph/state across callbacks |
| advance | Executable node/tracking environment | Success equality/commit/cleanup/clear/side propagation | Previous consumer | Dependencies/value/downstream/edge attachment |
| executeKnownNodeComputation | Callable compute | Tracked callback, restore, successful stale cleanup | Live watcher V | Liveness/graph/state |
| runWatcher | Watcher | Skip/execute/disposal exit/error recovery | Balanced context | Liveness/payload/deps/schedule |
| disposeWatcher | Watcher | Sweep/clear before old cleanup | Role | Callback can reenter; global no-edges unavailable |
| claim/release | Watcher | Set once/clear S | Other bits | Ownership only, not dirty/alive |

Failure distinction: advance retains old payload and partial reconciliation and sets Changed for retry; watcher failure clears transient bits for later scheduling. Different recovery models.

## Word-RAM model

P direct outgoing inspections; Ep all push visits including repetitions; Ev pull dependency visits; R tracked callback reads; L incoming/outgoing search links; M insertions/removals/moves; F side-fanout inspections; Q accepted schedule claims; B walker stack pushes/pops. Callback/host work is additional, not constant kernel work.

| Path | Cost |
| --- | --- |
| Equal write | Theta(1), value read/equality |
| Unequal write | Theta(1+Ep+B), plus hooks/computing-prefix scans |
| Ordinary push edge | Destination/state read, masks, zero/one state write, outgoing traversal |
| Computing edge | Up to Theta(D) backward links per encounter |
| One-step | Theta(F), destination read each edge, write when not C |
| Untracked producer/clean consumer | Theta(1) |
| Stable tracked read | Theta(1), cursor/edge/producer/version operations |
| Dynamic tracking | Theta(R+L+M) |
| Stale cleanup s edges | Theta(s), outgoing neighbor/endpoint updates, four link clears per edge |
| Pull | Theta(Ev+B) plus recompute/side push |
| Recompute | Callback + Theta(R+L+M+F+1) |
| Clean watcher | Theta(1) |
| Stable verified watcher | Pull cost, no body |
| Executed watcher | Cleanup/body + tracking/cleanup |
| Disposal | Theta(inDegree+outDegree) + cleanup |
| Claim/release | Theta(1) |
| Queue insertion | Amortized Theta(1), growth copies live entries |

Stable next-hit still compares producer and writes version/cursor even with zero structural mutation. Candidate repeated constants: cursor/version handling per read; caller-established tests; parent/sibling handling at clean boundaries; flag/pointer loads on saturated direct edges. Finding 1 removes searches/mutations before instruction optimization.

## Amortized analysis

Fixed noncomputing graph, unequal writes without reads: `O(initial propagation edges + N*P)`, plus hooks/special computing checks; not `O(initial edges + N)`.

Clean reads: Theta(N), tracked or untracked. Duplicates reuse one edge but retain lookup and current version-store work.

Stable D-dependency traces over N recomputations: `R=ND`, structural M after construction O(D), version/cursor work Theta(ND). Prefix reuse already avoids allocation/reorder/cleanup.

General sequence:

`T = Theta(R + L + M + Ep + Ev + F + B + Q) + callback work`

No general bound of L+M by semantic set changes: reorder searches preserve sets; distant duplicates probe fanout; eager detachment manufactures mutations; failed computations retain partial traces and may repeat work. Alternating dependency example has semantic Theta(N) but physical Theta(ND) changes before patch.

Ordered prefix costs Theta(prefix length) reads/metadata and zero structural mutations. Cleanup amortizes to physically removed edges, but premature removal inflates both cleanup and future allocations.

Scheduled deduplicates accepted claims; release before execution permits enqueue during callbacks. Queue cost follows Q, not writes. Visits/checks may still follow writes. Disposal may leave queued reference for drain skip; queue membership and live Scheduled bit are not universally equivalent.

## Working set and amplification

Distinguish total graph, reachable descendants/ancestors, actually visited edges/nodes, newly invalidated destinations, executed callbacks, Object.is-changed outputs, and accepted watcher schedule claims.

- Visited/newly-invalidated: saturated writes can inspect NP edges with zero new invalidations.
- Recomputed/changed: direct consumer executes on every write but may return equal output forever; ratio unbounded when denominator zero.
- Dependency reads/mutations: stable traces legitimately have many reads and zero changes; optimize bookkeeping, not arbitrary callback reads.
- Physical/semantic mutations: demonstrated avoidable suffix amplification.
- Pull visits/changed outputs: may scan many edges to prove stability; skipping without maintained summary unproven.
- Side-fanout/new promotions: can repeatedly visit already Changed destinations.
- Profile amplification: profilePushNode/profilePullNode walk incoming/outgoing lists to count degree. Separate structural increments and production timing.

## Specialization decisions

| Candidate | Removed work | Status |
| --- | --- | --- |
| Default producer with empty outgoing list | Searches, premature destruction/recreation | Strongest proof |
| Protocol cursor-derived version | Repeated cursor handling/duplicate store | Proven locally, codegen gain unmeasured |
| Known last-edge miss | Impossible adjacency guard | Proven |
| Nonempty stale suffix | Empty test/suffix selection | Proven guarded callers |
| Known suffix-head miss | Repeated match | Proven default resolver path |
| Pending idle checkpoint | Duplicate pending bit, not blockers | Proven locally |
| Clean-scan exhausted continuation | Sibling load/test | Proven locally |

Not justified: alive specialization across callbacks; all propagation edges current; saved pull edge attached after compute; removing Computing because graphs usually acyclic; mutually exclusive U/C; Scheduled implies dirty/alive; tracking implies not disposed; producer-wide saturation abstraction without maintenance measurement.

Next experiment selected only the no-outgoing-edge case. Remaining opportunities stay unimplemented. The baseline's structural proof predicts avoided recreation, not the exact number of moves or a timing percentage.


## Post-experiment addendum: block rotation and reconciliation amplification

Added after the empty-outgoing/suffix-preservation experiment, in response to the follow-up proposal. The preceding pre-experiment baseline is preserved. This addendum records the next hypothesis, not an implemented or verified algorithm.

### FACT: separate amplification metrics

Let Delta_set be the symmetric difference of consecutive final dependency source sets; M be links + unlinks + individual moves + (in a future instrumented rotation variant) block rotations. Allocation is reported separately, not counted a second time as insertion.

Define:

- `A_total = (P_total + M) / (1 + Delta_set)`.
- `A_mutation = M / (1 + Delta_set)`.
- For Delta_set > 0 only, `mutationsPerChange = M / Delta_set`.

Here P_total is the existing `linksTraversed` measurement: next/prev pointer reads, including null probes and structural bookkeeping, across the instrumented kernel. It is not exclusively reconciliation searches, and it excludes some other pointer loads. This operational definition must accompany comparisons.

For alternating D=64:

| Quantity | Before | Preserve |
| --- | ---: | ---: |
| Delta_set | 2 | 2 |
| P_total | 295 | 329 |
| M | 130 | 66 |
| A_total | 141.667 | 131.667 |
| A_mutation | 43.333 | 22 |
| mutationsPerChange | 65 | 33 |

Thus 65 -> 33 describes mutations/Delta, not the proposed full `(pointer reads + mutations)/(1+Delta)` expression. A_total improves about 7.1%, not twofold. Equal weighting makes this a structural work index, not a time predictor or a fitted Word-RAM cycle estimate.

### INFERENCE: do not ask total tracking work to become O(Delta)

Even ideal stable next-hit tracking reads pointers on each callback dependency read. With fixed Delta and increasing R, A_total can grow with R without avoidable searching. The next experiment should partition P_total into sequential tracking, reconciliation search, structural bookkeeping, and other kernel reads using separate plain increments. Define `A_search = (P_search + M)/(1+Delta_set)` only once that partition is measured; do not infer it by subtracting R from today's pointer count.

For unchanged dependency sets under cyclic/random reorder, Delta_set=0 does not describe order changes. Report order/run disruption separately (for example preserved consecutive adjacency pairs) and count block rotations independently of individual edge moves. The denominator's +1 avoids division by zero; it does not make set delta a complete order-edit distance.

### INFERENCE: block rotation can preserve the contiguous-prefix invariant

Call the skipped block **unvisited**, not stale: it may still be read later.

Given a valid incoming list `prefix P -> H ... T -> C ... L`, where H is the expected edge, C is an already-located matching edge strictly after H, T=C.prevIn, and L=lastIn, rotate the unvisited block H..T to the end:

`prefix P -> C ... L -> H ... T`

A splice changes only the boundary links: P.nextIn (or firstIn), C.prevIn, L.nextIn, H.prevIn, T.nextIn, and lastIn. Advancing tailIn to C and updating C.version establishes the same current-prefix boundary as an individual move. Outgoing lists, edge identities and versions of other edges are unchanged. C==L is a valid alias case when endpoints are captured before mutation.

The entire remainder after C, including the rotated block, remains unvisited. No proof of future staleness or eager deletion is required. Thus the existing contiguous-prefix representation need not be abandoned for this experiment.

This is a local structural proof, not whole-runtime equivalence. The operation must not invoke callbacks midway through the splice. A located candidate/endpoints cannot be assumed attached across callbacks. Tests must cover reentrant writes (current-prefix eligibility), nested reads/untracked execution, self-disposal, exceptions leaving partial traces, retries, prefix duplicates and suffix cleanup. Reordering the remaining old suffix may change later verification order after an exception; preservation of list integrity alone does not prove all observable behavior unchanged.

### HYPOTHESIS: one rotation replaces D individual moves in alternating

For `old: A S0 ... Sn`, `new: B S0 ... Sn`, rotating A behind the old suffix at S0 should make subsequent Si reads next-hits. Predicted structural events: one allocation/link, one rotation, one final unlink. Counting rotation separately gives three mutations, not two; allocation is not an extra mutation. Callback reads and sequential tracking still cost O(D).

The splice is O(1) after endpoints/candidate are known. Candidate lookup is an additional cost and is not generally O(1). A first experiment can isolate the existing bounded lookahead paths without simultaneously changing global search or initial-read reconciliation. Cyclic reorder with an initial miss needs its own candidate-resolution coverage; it is not automatically exercised by a cursor-only shortcut.

Counterexample controls: `old: A B C D`, `new: X A B C D` must retain old edges (no cascading head eviction); a local swap `new: B A C D` may rotate twice where the current policy needs one move; random reorder can similarly regress. Include forward/backward cyclic shifts, distant duplicates, small skipped blocks with long retained runs, and the existing complete-replacement matrix. Block rotation alone is not expected to fix complete replacement, because there is no old matching edge.

### HYPOTHESIS: adaptive detach is a separate experiment

Consecutive new reads may justify a miss-streak policy, but K=32 is not established by the existing suffix-length threshold. The evidence shows a policy discontinuity at length 32, not an optimal no-reuse streak of 32. Any future sweep must vary both K and reuse density. A burst `X0..X(K-1), A..Z` followed by full old-suffix reuse is an explicit adverse case.

Miss-streak state needs a defined lifetime across nested computations, context switching, errors and disposal; its update cost on stable reads must be measured. No such state or policy is added now.

### UNPROVEN causal claims and decision

Timing and counters are consistent with allocation/unlink avoidance helping alternating and extra reconciliation/bookkeeping hurting replacement. They do not identify individual operation costs, prove `cost(allocation/unlink) >> cost(pointer read)`, or establish cache/GC/JIT contributions. Likewise, equal structural counts in stable/reorder controls do not prove every timing difference is noise: code layout and generated-code effects can change time without changing these counters.

Priority: (1) isolated block rotation; (2) separately measured adaptive detach; (3) cursor/version specialization; (4) remaining proven branch removals. Preserve the existing before/preserve measurements as controls. Do not merge the preserve-only candidate as an unconditional production optimization. No additional runtime patch or benchmark timing run was made for this addendum.


## Cost-vector refinement and bounded rotation experiment

The next experiment adopts the requested primary vector:

`R, S, A, L, U, M, B, W, Delta_set`

R is callback dependency reads; S is reconciliation/search probes (not sequential next-hit work); A allocations; L/U attachments/removals; M individual moves; B block rotations; W raw graph-pointer writes; Delta_set final dependency set symmetric difference. Definitions and instrumentation scope are in the [rotation experiment README](../perf/block-rotation/README.md).

Report `SearchAmp=S/(1+Delta_set)` and `MutationAmp=(L+U+M)/(1+Delta_set)` separately. A/B/W remain separate; B is deliberately excluded from MutationAmp, so that ratio alone cannot establish superiority of rotation. Earlier totalAmplification tables are historical derived indices, not the primary cost model or a time predictor. No experimentally unjustified weights are introduced.

The [seven invariants](../perf/block-rotation/INVARIANTS.md) are captured before implementation. Only the existing bounded one-/two-hop match helper is replaced in a build/test overlay; source stays on the preserve candidate. Current-prefix continuity is retained; moved blocks remain unvisited, not proven stale. No adaptive detach or new per-pass state is introduced.

The [results](../perf/block-rotation/results/summary.md) include stable, alternating, replacement, random reorder, local swaps, directional cyclic shifts, front insertion/removal, and failure/retry. Diagnostic replay computes block reuse distance outside kernel and timed work; measured event/write counts and final order cross-check the replay. Failed attempts censor future reuse instead of declaring the skipped block permanently unused.

The [offline oracle](../perf/block-rotation/results/oracle.md) has an explicit restricted action set and separate A/W optima. Regret is objective-specific; there is no claimed ideal wall-time policy. Immediate eager detach is modeled as a counterfactual, not confused with the historical threshold-32 implementation.
