# Runtime model

Why the runtime is shaped the way it is: the semantics it must preserve, the
evidence each mechanism relies on, the least state that distinguishes what
matters, what it costs, and what was tried. Normative facts live in
[RUNTIME.md](./RUNTIME.md), [SEMANTIC_CONTRACT.md](./SEMANTIC_CONTRACT.md) and
[INVARIANTS.md](./INVARIANTS.md); this document explains them and does not
restate them.

The model was consolidated on 2026-10-29 from the formal model of March 2026
(`theory/01`, `theory/02`), five research passes R₁–R₅ (tracking automaton,
phase model, evidence algebra, state quotient, obligation cost) and the
measured studies under `perf/` and `bench-results/`; later results are added
to §7.2 and §9. The probes, tools and raw results live on the branch
`research/cross-stage-profile` (`2684905`), directory
`research/reflex-runtime-model/` (§11).

**Claim strength.** _Proven_: derived from code transitions under stated
premises. _Witnessed_: an executable counterexample or test. _Sampled_: no
difference on a finite corpus; an observation, not a proof. _Measured_: time
or code shape under a stated protocol. _Hypothesis_: untested.

## 1. Domains

| Domain | Contains                                                                                                                                          | Guarantee                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **M**  | managed factories, read/write/runWatcher, a claiming host, enqueue-only hooks, pure callbacks, disposal only by `disposeWatcher`, monotonic clock | every safety and minimal-state conclusion                        |
| **L**  | M plus writes inside watcher bodies and cleanups (contract L1–L5)                                                                                 | the same; watcher reentrancy is contractual                      |
| **X**  | plain host, actions in hooks, writes inside computeds (F1), raw `disposeNode`, `setTrackingStamp`, custom tracking strategies, manual link/unlink | described, not guaranteed; X counterexamples are not M/L defects |

## 2. Semantics

The March model described a node by its last validation time `v`, last
semantic change `t` and structural epoch `τ`, with freshness
`∀p ∈ Parents(n): t(p) ≤ v(n)`. The runtime keeps that semantics with
different means:

- **No versions in nodes.** Push says "may have changed" (`Unknown`) and
  "changed" (`Changed`); pull checks. Same-value cutoff is `Object.is` at
  commit in `advance`.
- **`τ` is an accelerator, not information.** A build with the clock frozen at
  0, where prefix membership is found by walking, matches the normal build on
  60,000 programs under the exact policy (R₁, sampled). What is needed is the
  accepted prefix of the current pass, not an epoch number.
- **Cleanup by success certificate, not by mark.** "Remove edges stamped with
  an old epoch" became "remove the unread suffix after a successful pass".

Goals, for consumer `n` and attempt `e`: `V(n,e)` validate, `X(n,e)` execute,
`N(w,e)` the host must run watcher `w` (computeds are pulled, not delivered).

| Rule          | Content                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 birth      | a committed change of `p` gives each `n` with an accepted edge `p→n` goal `X` if direct, else `V`; on a computed `X` absorbs `V`, on a watcher they are independent |
| G2 absorption | a goal born at `t` is discharged by an execution that reads the affected dependency after `t`; a write to a not-yet-read dependency births nothing                  |
| G3 delivery   | while a watcher has an outstanding goal no live continuation will discharge, the host owns running it; under claiming, ownership is `Scheduled`                     |
| G4 barrier    | `X(w,e)` starts only after `V(w,e)` is discharged                                                                                                                   |
| G5 discharge  | `V` by a complete stable validation, `X` by a successful execution, `N` by dequeue                                                                                  |

Push rules, the prefix filter, deferred `Revalidate` delivery and the
different quantifiers of pull and validation follow from G1–G5 (§4). F1 is
the only place where the goal model distinguishes more than the runtime (§5.3).

## 3. Representation

Carriers: a node has `state` (int32), `firstIn/lastIn`, `firstOut/lastOut`,
`tailIn`, `compute`, `payload`; an edge is one object in both lists with a
`stamp`; registers are the active consumer, the clock, propagation and batch
depths and the context bank. The boundary axioms (reciprocity, one edge per
pair, append-only `out(P)`, monotonic clock) are in INVARIANTS §1 and §5.1;
mutants M12 and M17 witness that the tests detect their violation.

A tracking pass factors `in(C)` as accepted prefix · retained suffix and
preserves the identity and relative order of not-yet-accepted edges (R₂). A
read is locate → classify → reconcile; reconciliation never unlinks.

Stamps, checked on 3.0 M reads and 1.06 M operation boundaries: along `in(C)`
stamps never increase; suffix stamps are strictly below the prefix stamp; all
are equal after a successful pass. A stamp is a local class certificate of
one consumer's edges, not a computation id: nested passes of different nodes
share one number (S5), and a pass that empties its prefix continues under a
new number (S10). The `cursor === lastIn` branch (INV-T2) is needed in exactly
one case: watcher validation after a failed execution (S6).

`tailIn` is one slot with several owners (R₁: seven reachable readings, two
anomalous; R₃: specializations of one lease):

| Owner's phase                      | Meaning of `tailIn`                                                  |
| ---------------------------------- | -------------------------------------------------------------------- |
| tracked callback                   | accepted frontier                                                    |
| suspended outer callback           | the same frontier, frame saved                                       |
| watcher validation                 | the whole span (`lastIn`)                                            |
| callback returned, cleanup pending | the cut boundary                                                     |
| idle after success or failure      | residual history or null                                             |
| idle producer                      | outgoing hint (INV-H) or prepared cell (INV-P)                       |
| anomalies (X)                      | a detached edge after restore (S1); edges of a disposed watcher (S2) |

A slot may be reused after its last authorized consumer, not after its phase
bit is cleared (R₃, lemma C).

## 4. Evidence, obligations, rights, continuations

The runtime is built from four kinds of entity and three operations on them
(R₃):

| Kind             | What it is                                                          | Copy and merge                 |
| ---------------- | ------------------------------------------------------------------- | ------------------------------ |
| `Fact(φ)`        | an observed statement (`edge.from = p`, `Object.is` was false)      | copyable while its scope holds |
| `Debt(g, R)`     | an undischarged goal (validate, execute, deliver)                   | merge is union                 |
| `Own(r, ω)`      | an exclusive right to consume a resource (a cleanup, a queue entry) | not copyable; transferred      |
| `Lease(φ, ω, λ)` | a continuation's right to use a fact until it changes               | expires without making φ false |

The operations are **accumulate knowledge**, **discharge work** and **transfer
responsibility**. Mixing them explains most of the flag complexity: one int32
encodes goal, generation, role and owner at once, and one pointer (`tailIn`)
encodes identity, coverage boundary and a search guess.

**Right to act** = valid proof of scope ∧ live lease ∧ role policy ∧ the
continuation's own right. Push, the prefix filter, the owned parent edge, the
queue claim and cleanup hand-off are special cases.

**Accountability:** `Outstanding(g) ⇒ StoredDebt(g) ∨ OwnedContinuation(g) ∨
HostResponsibility(g)` while the contract promises to serve `g`. A hook that
throws mid-wave and F1 break the unconditional form; both are losses the
contract allows.

**Quantifiers.** An existential goal ("must this computed recompute?") closes
with one witness; a universal goal (watcher validation, pair absence) needs
the whole scope. Hence pull stops at the first change and `pull_frontier`
covers the whole frontier.

**Where information lives.** Part of the state lives in the continuation, not
the node. `Computing` is pure phase information. During validation the entry
`Changed` is copied to a local `mustExecute`; the node bit serves exactly two
consumers: recovery after a thrown validation, and execution evidence arriving
by one-step push along a side path (§5.2). A node must carry whatever push
reacts to, because push addresses nodes, not frames.

## 5. Mechanisms as consequences

| Mechanism                | Goal and evidence                                                                                                  | Consequence                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| full push                | a commit is known, intermediate values are not: direct receiver `X`, transitive `V` (G1)                           | emission only from a clean watcher: "dirty and idle ⇒ delivered" (G3)           |
| push into an active pass | edge in the accepted prefix: goal for `e+1`; outside it: nothing (G2)                                              | for computeds the record is erased at commit (F1)                               |
| one-step push            | after a changed recompute: `X` to direct subscribers except the owner's route                                      | no prefix classification; `Scheduled` and `Computing` suppress redelivery (F17) |
| pull                     | existential: the first change suffices; "no" needs the whole remainder stable                                      | the stack is a serialized continuation                                          |
| watcher validation       | universal barrier before lifecycle (V3), even with `X` already known                                               | in M and L no `Visited`/`Revalidate` is written during validation (0 of 17,982) |
| tracking                 | record each successfully read source exactly once                                                                  | moves keep identity; cleanup removes only the proven-unread suffix              |
| scheduling               | debt and delivery are separate: claim hands responsibility to the host, take to the execution                      | `Scheduled` is not derivable from dirty bits (LB3)                              |
| cleanup callback         | the resource sits in one shared slot or one local; the owner is cleared before the call                            | a throw discharges the used right, not the next body's goal                     |
| failure recovery         | rolling back control is compatible with keeping positive progress                                                  | a failed read leaves no edge (C4, R3)                                           |
| batch, context, domain   | idle notice waits for an allowed point; a bank switch moves the right to execute; teardown waits for continuations | neither batch nor snapshot rolls back values or the graph                       |

### 5.1 Method of the state quotient (R₄)

A probe wraps the runtime module of the oracle interpreter and gets a control
point at every runtime entry, callback and hook. At each point the node's
local state (`state & (U|C|V|K|Q|R)`) is replaced by another state reachable
in the same role and phase, and the rest of the trace is compared in four
projections: `val` (values, runs, errors), `eff` (plus computed executions),
`host` (plus deliveries), `repr` (plus topology). Corpus: 4 families × 6,000
seeds × 3 domains, 218,486 substitutions. Separation is witnessed; merging is
sampled, then checked for closure by applying the encoding at every point of
every run.

### 5.2 Result

| Phase            | Reachable in L | M/eff | L/eff | Predicted by G1–G5                               |
| ---------------- | -------------- | ----- | ----- | ------------------------------------------------ |
| computed idle    | 3              | 3     | 3     | `{∅, V, X}`                                      |
| computed exec    | 2              | 1     | 1     | a pure computation creates no goal during itself |
| watcher idle     | 12             | 8     | 8     | `(v, x, q)`; delivery ≡ `v ∨ x`                  |
| watcher validate | 4              | 4     | 4     | current `x` × `q`                                |
| watcher exec     | 9              | 2     | 6     | register for `e+1` `{∅, R, V}` × `q`, `V ⊒ R`    |
| watcher cleanup  | 4              | 2     | 2     | `q`                                              |

All twelve counts match the prediction. Merging every indistinguishable state
at once is closed: 0 differences on 23,554 programs in M and L in every
projection, `repr` included (sampled plus closure; a runtime with rewritten
transitions was not built).

Redundant distinctions of the runtime (representational; no code change
needed):

| Merge                                  | Rewritten programs → differences                                     | Condition                                                                              |
| -------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| idle `Visited` ≡ `Changed`             | L 163 → 0; X 156 → 5 in `host` (3 plain-host, 2 at the budget limit) | claiming host only; under a plain host `Visited` itself carries "already delivered"    |
| `Visited` absorbs `Revalidate` in exec | L 53 → 0; X 43 → 0                                                   | —                                                                                      |
| `Unknown` dead in exec                 | L 336 → 0; X 366 → 4 (all at budget or stack limit)                  | —                                                                                      |
| `Unknown` dead in cleanup              | L 114 → 0; X 110 → 0                                                 | —                                                                                      |
| bits of a computing computed           | M/L/X ≈ 2,400 → 0                                                    | in X (F1) `Unknown` is live for `host` only: a false redelivery through a dropped edge |
| `Changed` during validation            | M 6,228 → 51: **not redundant**                                      | 46 of 51 are thrown validations; 16 are one-step evidence along a side path            |

**Direction.** Adding an obligation is almost always invisible, removing one
is visible (idle watcher, M/eff: `C→UC` 0 of 320 contexts, `UC→C` 2;
`Q→UQ` 0, `UQ→Q` 203). An encoding allowed to over-approximate needs 5 idle
watcher classes instead of 8. But `∅→U` is observable in 153 contexts:
`Unknown` without delivery breaks liveness.

**Non-transitivity.** Compatibility restricted to reachable contexts is not
an equivalence in general (incompletely specified automata, Paull–Unger), so
the minimum is a cover, not a Myhill–Nerode quotient. At 6,000 seeds M and
L/eff form partitions; two triples in L/val rest on the rare `UCVQ`
(14 programs) and are not proven.

**Information.** With a phase-relative code (the continuation knows the
phase) a watcher needs `⌈log₂ 8⌉ = 3` bits; the runtime uses five
(U C V R Q) plus `Computing`. A computed is already minimal: three classes in
two bits. This is a fact about information, not a proposal: bits in an int32
are free, extra guards are not.

### 5.3 The missing distinction: F1

A computed invalidated during its own evaluation records the next attempt's
obligation (`markComputingSubscriber` sets `V|U`), and `advance` erases it at
commit without reading it. The goal model needs a `{∅, R, V}` register here,
as a watcher has in exec. This is the only case where the runtime's quotient
is coarser than the goal quotient. Convergence needs that register;
rejection needs nothing. Hint (R₁, P15): `Visited` at the end of
`advanceCore` is an exact, prefix-certified proof of reentrant invalidation.

## 6. Information bounds

| Bound | Statement                                                                                                                                                                | Consequence                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| LB1   | over unordered incidence lists with no extra index, exact pair absence needs Ω(min(r_out, r_in)) probes of not-yet-excluded positions                                    | any zero-field O(1) absence shortcut narrows the domain, relies on an unstated invariant, or has a counterexample |
| LB2   | after arbitrary failed passes that rewrite stamps, the exact committed subset of `m` retained edges needs Ω(m) bits; the last successful pass number is not enough (E15) | exact retry costs memory; the conservative union is the least safe envelope once provenance is lost               |
| LB3   | ownership (`Scheduled`, pending cleanup) and freshness are not derivable from each other                                                                                 | they are independent coordinates; moving them to an external owner moves the information too                      |
| LB4   | a disposed producer cannot be told from a new one holding `undefined`; freshness cannot be read from stamps                                                              | no universal dead-node detector without a tombstone; no freshness by stamp                                        |
| —     | for a duplicated hub pair (long × long) under "no new entities", the search cannot shrink: reaching `e(P, C)` from `P` needs writable state reachable from `P`           | add state (hint, finger, born order, tape) or accept the cost                                                     |

## 7. Cost

### 7.1 Cost model

Run time is `T_execute + T_track + T_cleanup + T_delivery`. `T_execute` is
near a local optimum (`theory/02`). Cost is set by maintaining topology under
unstable dependency order and membership; tracking and cleanup are coupled,
and optimizing one alone gives false wins.

- **The cliff is in edit length, not permutation shape.** long × long is
  expensive only at edit distance `Θ(D)` per pass (a uniformly random
  permutation); no plausible application source of that was found.
- **Visits cost loads, not branches** (R₅): halving push checks on saturated
  visits gave at most −0.8%.
- **The benchmark suite rarely reaches expensive paths:** ≥94% of reads settle
  at L0 or constant L1; the general lookup is never called on `bench/`.
- **Retention.** A node is ~97 B, an edge ~81 B (Node 25, 30,000 retained
  nodes). Managed ownership keeps graphs flat over 10,000 mount cycles; raw
  computeds without disposal leak ~1.15 KB and 5 edges per cycle.

### 7.2 Experiments and verdicts

| Candidate                                                    | Basis                                       | Result                                                                                                                       | Verdict               |
| ------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| exact lookup + pass stamp (#52)                              | LB1                                         | permutations 2.7–5.1× faster locally; paired CI nothing slower                                                               | in `dev`              |
| producer hint, hint-first (#57)                              | positive guess with a cheap miss            | `A.track.hub-duplicate` −66%, then −19% more                                                                                 | in `dev`              |
| preserve the unread suffix (#67/#69)                         | change structure only when semantics needs  | window-slide 256×128 30 → 6.75 ms; ladder rungs 17–25× faster                                                                | in `dev`              |
| outgoing finger, budget 8 (#68)                              | append-only `out(P)` aligns schedules       | lab shuffle 256×128 ~14 → 1.0 ms; an unbounded ring cost 169× more links on head-far → bounded regret                        | in `dev`              |
| prepared tape, frameless (INV-P)                             | LB1: add state where locality fails         | chaotic shapes 0.16×, cert mount 0.075×; a framed version cost +7–25%, the frameless one removed it                          | in `dev` (#75)        |
| finger-first rounds (#75)                                    | bound the race by the lockstep's own rounds | probes per finger lookup −45% on replace-half ×16; tape tax on ×16 12–13% → 5–9%                                             | in `dev`              |
| K-gated strike (strike when lockstep reaches K)              | measure cost instead of counting strikes    | no K wins; K=16 loses 4–10% on ×128 and window-slide                                                                         | rejected              |
| foreign recorded cell is no finger                           | prepared cells pollute other lookups        | confirms pollution, but shared-shuffle ×128 +10–15%                                                                          | rejected              |
| inlining budget 1500 (flag)                                  | inline the whole read-miss chain            | miss-heavy shapes 5–25% faster for every build; the lever is the outer chain under `readProducer`/`advanceCore`              | lever, not a change   |
| one never-inlined miss handler (m2)                          | keep miss handlers out of the read path     | hub-duplicate +34%, lab stable +40%; mechanism unexplained                                                                   | rejected              |
| lockstep code shapes (unrolled, split, switch)               | code shape                                  | identical lookups, geomean 0.979–1.010: the loops are memory-bound                                                           | rejected              |
| block rotation of the skipped suffix                         | one rotation instead of D moves             | window-slide 73 → 95 links per read                                                                                          | rejected              |
| `edge.born` + pass bound                                     | LB1, a new distinction                      | replace_half 12.6 → 1.5 ms; +36 instructions in every inlined `advanceCore`                                                  | branch, decision open |
| lazy identity retention after cleanup                        | keep evidence across passes                 | wins CPU; blocked by memory ownership (producers live until the next cleanup)                                                | closed by owner       |
| retaining the validation cursor                              | evidence flow                               | 78 of 363,858 pull visits in 3,000 adversarial programs, 0 in benchmarks; would cost 140,100 writes                          | rejected              |
| liveness pruning / suspension of unobserved computeds        | lifetime vs liveness                        | at most −0.7% of work, only after hundreds of dormant writes; break-even `W·S_w > C_d + C_r` rarely met                      | closed                |
| V3: full validation frontier                                 | universal goal                              | `O(D)` root scan is semantically required; repeated push into a shared root removed by "a continuation owns its stable edge" | kept                  |
| batch boundary check (R₅)                                    | discharge only with debt                    | premise false: `IdlePending` is checked first; −1.7%, below threshold                                                        | rejected              |
| C1: carry a negative lookup proof (R₃)                       | principle 3                                 | exact; +22.4% (inlining lost), C1b +2.9–3.2%                                                                                 | rejected              |
| D1: push decision order by frequency (R₅)                    | decision tree from the quotient             | exact; ≤ −0.8%                                                                                                               | rejected              |
| edges as a class                                             | object shape                                | +6–10% on three workloads (call-target checks)                                                                               | rejected              |
| C2 success cut as cleanup argument; C3 hint repair on unlink | principles 2, 3                             | not built                                                                                                                    | hypothesis            |

What remains at the bound: schedules unrelated to `out(P)` get nothing from
the finger; proofs of absence between two wide endpoints need the lockstep or
a tape; the lab window slide is at 6.75 ms against 1.0–1.4 ms elsewhere, 54%
of its links being genuine absence proofs and 41% reuses no locality reaches.

### 7.3 Obligation profile (R₅)

Classifying every watcher run by cause and outcome: the benchmarks have no
redundant deliveries, no empty host runs and no runtime-opened epochs. In L,
runtime-opened epochs are 4.7% of host runs and 89% of them execute. The
largest work that ends in nothing is 132 stable validations per step in
`D.list.filter-select`: a `selected` shared by 200 rows without a keyed
selector. That is graph shape, fixed in the framework, not the kernel.

## 8. Principles

1. The quantifier of a goal decides what proof suffices.
2. A guaranteed continuation replaces a materialized message if it keeps
   responsibility on every exit.
3. Negative knowledge moves as a closed scope, but only when moving it is
   cheaper than repeating it (C1 shows it is not always).
4. Preserving identity and revoking a right are different operations.
5. A temporary slot's type is set by its last live consumer, not by a phase
   bit.
6. Compressed history bounds the most exact possible recovery (LB2).
7. A fast path needs a cheap miss that never stalls the general proof
   (bounded regret).
8. Do not change graph structure until semantics requires it.
9. Optimize tracking and cleanup together; negative results are the map.
10. Minimal information and minimal work are different problems: the first is
    nearly solved in the contract domain, the second is graph shape and
    representation.

## 9. Findings

F-numbers are stable identifiers used by tests, the oracle's verdict classes
and commit messages. A new finding takes the next free number.

| Id  | Status                       | Finding                                                                                                                                                    | Resolution                                                                                    |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| F1  | open, owner decision         | a write to an already-read dependency during a computed's own evaluation is lost; the computed stays clean and stale                                       | rejection, convergence or a bounded policy (§5.3); pinned by `test/characterization/`         |
| F2  | removed                      | unused `Disposed` bit                                                                                                                                      | —                                                                                             |
| F3  | removed                      | dead `allowSlowPath` parameter                                                                                                                             | —                                                                                             |
| F4  | open, cosmetic               | empty-suffix exit in `cleanupUnvisitedSources` is unreachable                                                                                              | could become a DEV assertion                                                                  |
| F5  | kept                         | the default strategy's suffix-head hit is unreachable through the resolver                                                                                 | strategies are public                                                                         |
| F6  | recorded                     | DEV: direct-phase watcher invalidation emits a debug event without a hook; transitive needs one                                                            | DEV only                                                                                      |
| F7  | open, cosmetic               | `countIn`/`countOut` duplicated (PROFILE)                                                                                                                  | —                                                                                             |
| F8  | superseded by F17            | "validation never redelivers its own watcher" held only for trees                                                                                          | —                                                                                             |
| F9  | open, recorded               | an `Unknown` consumer without inputs is recomputed as a dependency but treated as clean as a root; reachable only after disposing a live upstream producer | pinned by the oracle                                                                          |
| F10 | fixed `9b21f58`              | edge creation coerced the stamp to int32 while reuse stored uint32: from epoch 2³¹ a pass carried two stamps and could link duplicates                     | `>>> 0`; regression in `runtime.tracking-stamp.test.ts`                                       |
| F12 | fixed `bb5fc5f`              | DEV `stackStats().propagate.peak` was always 0                                                                                                             | —                                                                                             |
| F13 | fixed `190a09e` (#52)        | a pass stamp equal to a stale suffix stamp (rewound or wrapped clock) dropped a dependency                                                                 | forward-only clock, INV-T3; oracle class F13                                                  |
| F15 | fixed                        | a watcher invalidated transitively during its own run kept `Unknown` without `Scheduled` and never ran again                                               | `Revalidate` plus self-delivery (R9)                                                          |
| F16 | fixed `ab5ec15`              | a cleanup that wrote through a dependency and threw was recovered to idle behind a dirty computed                                                          | cleanup failures scan dependencies like callback failures                                     |
| F17 | fixed                        | a watcher was redelivered during its own validation through a side edge; the queued copy ran as a clean skip                                               | `Computing` joins `Scheduled` as the delivery guard (R10); oracle class own-epoch delivery    |
| F18 | contract boundary 2026-11-01 | a watcher that failed on the first read of a throwing computed is not re-entered when the cause is repaired                                                | no runtime change; C4 and R3 state it; witnesses in `test/differential/catalog/boundaries.ts` |

Gaps found by the model, not yet closed:

| #   | Finding                                                                                                                                                         | Kind             | Action                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------- |
| 1   | disposing a source mid-pass of its consumer: the mutant "rewind the cursor to null instead of `prevIn`" yields a stale value and survives 80,000 programs (S7c) | test gap         | a unit test for S7c; dispose actions for producers in the oracle generator |
| 2   | mutant M10 "transitive invalidation as execution evidence" survives every suite, though the quotient separates R from V                                         | test gap         | turn the 106 separated L/eff pairs into merge mutants (`pnpm rt audit`)    |
| 3   | save/restore of `tailIn` in `pull_frontier` is a dead write and may restore a detached edge holding a disposed node (S1, X)                                     | harm in X        | drop the restore (bundle change, needs approval)                           |
| 4   | a watcher that disposes itself and then reads keeps edges; deliveries go to a disposed node (S2, X)                                                             | leak in X        | `unlinkAllSources` after execution when `compute === undefined`            |
| 5   | a custom `readTrackingStrategy` must restamp the returned edge or the dependency is silently lost (S3)                                                          | unstated duty    | stamp in the resolver, or document it in `config.ts`                       |
| 6   | the suffix carries causal authority when a computed entered with `Unknown`: the "Unknown and not Watcher" push branch precedes `Computing` (S8)                 | comment mismatch | fix the comment in `reuseEdge.ts`                                          |
| 7   | the paired benchmarks read through `readConsumer`, the facade through `readConsumerLazy`/`Eager`: the facade entry is unmeasured                                | measurement gap  | a workload through the facade entry                                        |
| 8   | four `general` family programs diverge from the baseline beyond every accepted class (`testkit/oracle/corpus/general-*`)                                        | unclassified     | classify each or fix                                                       |

## 10. Open owner decisions

- **F1:** rejection, convergence or a bounded policy.
- **Retry semantics:** the conservative union (now) or exact
  `committed ∪ last partial` at Ω(m) cost (LB2).
- **Cold-path bundle changes:** gaps 3, 4 and 5 of §9.
- **`edge.born`:** measured win on replace_half against cost in
  `advanceCore`.
- **Keyed selector in the framework:** the only large work elimination found
  (§7.3).

## 11. Reproduction

Tools and raw results are on `research/cross-stage-profile` (`2684905`),
directory `research/reflex-runtime-model/`:

```text
witnesses/   executable witnesses: phase model (R₂), evidence algebra E01–E15
             and lookup L01 (R₃), mutations M01–M14, probes S1–S10 (R₁)
tools/       probe, quotient, analyze, verify-map, classify-G, obligation-profile, build
results/     saved results referenced above
```

```bash
git switch research/cross-stage-profile
node node_modules/vitest/vitest.mjs run --config research/reflex-runtime-model/witnesses/vitest.config.ts
node research/reflex-runtime-model/witnesses/mutations.mjs
cd research/reflex-runtime-model/tools
node quotient.mjs --seeds 6000 --reservoir 80
node analyze.mjs > ../results/analysis.txt
node obligation-profile.mjs --steps 2000 --seeds 6000
```

Timing claims use the paired protocol of [PERFORMANCE.md](./PERFORMANCE.md);
experiment harnesses in the tree are listed in [perf/README.md](../perf/README.md).
