# Runtime invariants

The state the kernel maintains at operation boundaries. The public contract is
[RUNTIME.md](./RUNTIME.md); [RULES.md](./RULES.md) ties the load-bearing rules
to code and tests. When this text and the code disagree, the disagreement is a
finding ([MODEL.md](./MODEL.md) §9), not a license to pick either side.

## 1. Graph

A `ReactiveEdge` is one object linked into its producer's outgoing list
(`firstOut … lastOut`) and its consumer's incoming list (`firstIn … lastIn`).
At operation boundaries:

- **Reciprocity.** `e ∈ in(e.to) ⇔ e ∈ out(e.from)`; neighbor links are
  mutual, ends have null links.
- **One edge per pair.** At most one edge per `(producer, consumer)`. A link
  happens only after its absence was proven.
- **`out(P)` is append-only.** Tracking moves edges only inside `in(C)`, so
  `out(P)` lists subscribers in the order they first linked.

Inside an operation the lists may be one-sided. The cleanup debug event fires
between the incoming cut and the outgoing unlink. Graph mutations live in
`src/kernel/shape/graph/`; use them rather than editing links directly.

## 2. State bits

Defined in `src/kernel/shape/meta.ts`, inlined as literals in production.

| Bit          | Meaning                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| `Unknown`    | upstream may have changed: validate before recomputing                                                      |
| `Changed`    | recompute or execute without proving an upstream change                                                     |
| `Visited`    | direct invalidation during execution; on a watcher, execution evidence that may outlive the run             |
| `Revalidate` | watcher only: transitive invalidation during its validation or execution; a validation obligation only      |
| `Computing`  | a callback (or watcher validation) is active; changes how push reads the incoming prefix                    |
| `Watcher`    | watcher role                                                                                                |
| `Scheduled`  | host queue ownership, claimed and released apart from execution                                             |
| `Leased`     | may have an edge to the prepared tape's owner (§5.5); a stale bit costs a lookup, never an answer            |

`Both = Unknown | Changed` is the dirty mask. At rest a computed is clean,
`Unknown` or `Changed`; a producer carries no evidence bits. Dirty bits are
not exclusive in general: a new watcher starts `Changed | Unknown`, and
computing invalidation can set both. Producer/consumer role constants exist
only in DEV and are 0 in production. There is no disposal bit.

`Visited` and `Revalidate` are the two kinds of reentrant evidence.
Stabilization forces on `Changed | Visited`; `Revalidate` is never forced:
the next pass validates and equality decides. A validation pass discharges an
entry `Revalidate`; only invalidation recorded during that pass requests
another.

`Scheduled` is independent of freshness. A watcher that keeps `Unknown` after
a run or a stable validation is delivered by `runWatcherCore` itself
(`deliverRetainedValidation`, `retainAfterExecution`) unless `Scheduled` is
held, because later pushes merge into a retained `Unknown` without notifying
(L1). The host releases `Scheduled` before running a watcher, so during the
run `Computing` is the ownership certificate: one-step push after a recompute
records `Changed` into a watcher holding `Scheduled` or `Computing` but does
not deliver it (F17). A reentrant write still takes the computing-subscriber
path and is delivered.

## 3. Push

`writeProducer` compares with `Object.is`, commits, then invalidates.

- All direct edges are handled first, in list order; transitive branches are
  then walked depth-first, children before the next sibling.
- A clean direct subscriber becomes `Changed`; an `Unknown` non-watcher is
  promoted to `Changed` **before** the `Computing` branch is considered. A
  clean transitive subscriber becomes `Unknown`. Dirty subscribers stop
  descent. This is not a topological sort.
- A computing subscriber is marked only through an edge in its tracked prefix
  (at or before `tailIn`): `Visited | Unknown`, or `Revalidate | Unknown` for a
  watcher reached transitively. Other edges are ignored.
- A direct watcher stops descent; a transitive watcher stops it when a hook is
  installed. Hooks run synchronously and see the partially updated graph;
  continuation links are read after each hook.
- `push_iterator_once`, after a recompute that changed the value, marks direct
  subscribers lacking `Changed` and walks no further. It skips the edge owned
  by the active pull walker.

## 4. Pull and recompute

Pull has three layers whose boundary is an invariant; a specialization may
optimize inside a layer but must not merge them.

1. **Root policy** (`shouldRecomputeCore`, `pull_frontier`). Root `Changed` is
   execution evidence. Root `Unknown` is discharged only after every incoming
   edge produced a stable proof. A watcher validates its **whole** committed
   frontier before any lifecycle work (V3).
2. **Edge proof** (`pullDependencyDirty`). Answers "did this dependency
   change?" for one edge, from the state its caller loaded once. `Changed` →
   recompute; `Unknown` leaf → recompute; `Unknown` with inputs → descend.
3. **Continuation machine** (`pullDependencyDeep`). An explicit stack of edge
   continuations, safe under reentrant pull. The first change found ends the
   scan; a stable branch resumes its next sibling.

Effects decide where barriers go. Reading a clean edge runs no user code. A
dirty proof may call `advance` and is a reentrancy barrier: the caller
re-reads root evidence and continuation links after it. `advance`, cleanup,
watcher execution and hooks are barriers unless proven otherwise.

`advance` (recompute) resets the cursor, clears `Visited`, sets `Computing`,
enters tracking and calls `compute`. The previous consumer is restored before
anything else happens on exit.

- **Success.** Remove the unread suffix (§5.4), compare with `Object.is`,
  publish only a changed value, clear computing and dirty bits, then
  `push_iterator_once` if the value changed. The final state derives from the
  evidence present **before** the callback; marks set during it are dropped
  (this is F1).
- **Failure.** Keep the old payload, clear `Computing | Unknown`, set
  `Changed`, rethrow. A failed computed also removes its unread suffix (C3).

## 5. Tracking

### 5.1 Pass and stamp

At the start of a computation `tailIn` is reset to null and the old incoming
list stays. While the node is `Computing`, `firstIn … tailIn` is the prefix
accepted in this pass and the rest is the suffix of older dependencies
(INV-T1). `edge.stamp` is a tracking stamp, not a value version: it records
which pass last accepted the edge.

- The first read of a pass takes the current `trackingStamp`; every later read
  takes the cursor's stamp, even after nested computations advance the clock.
  Callers cannot supply a stamp.
- **INV-T2.** With `tailIn === lastIn` every incoming edge is in the prefix.
  Watcher validation relies on it.
- **INV-T3.** With a nonzero cursor stamp `S` and a nonempty suffix, an
  incoming edge is in the prefix exactly when it carries `S`: accepted edges
  are stamped `S`, suffix edges carry earlier, smaller stamps.
- The clock is kernel-wide, only moves forward and never repeats a value
  (exact for 2^53 passes). A repeated stamp would let a stale edge pass as a
  prefix member and drop a dependency (F13).

Executable definition: `isEdgeInTrackedPrefix` in
`src/kernel/stages/tracking/prefix.ts`.

### 5.2 A read

1. **Locate** the edge of `(P, C)` or prove there is none (§5.3).
2. **Classify**: in the prefix → duplicate, nothing moves; in the suffix → move
   the same edge right after the cursor and stamp it; absent → link a new edge
   after the cursor.
3. **Reconcile** without searching again (`reconcileLocatedRead`).
   Reconciliation moves and links; it never unlinks.

A configured `readTrackingStrategy` is called at the reconcile step after the
resolver's own lookup, so it pays two lookups per call.

### 5.3 Locate

Constant-time guesses first, each cheap when wrong, then one exact proof:

| Level | Where                     | Settles the read with                                                                  |
| ----- | ------------------------- | -------------------------------------------------------------------------------------- |
| L0    | `resolve.ts`, consumer    | the next edge, the cursor, the first edge, one- and two-hop lookahead, `lastIn`        |
| L1    | `locate.ts`, producer     | empty `out(P)`, the newest edge `lastOut`, a sole edge to another consumer             |
| L1h   | `findEdge.ts`             | the hint, when it is this pair's edge (§5.5)                                           |
| L1    | `findEdge.ts`             | a two-link head start at `firstOut`                                                    |
| L2    | `findEdge.ts`             | the lockstep, raced by the outgoing finger when the slot holds one                     |
| tape  | `tape.ts`                 | a prepared cell, or a certificate of absence under a covered live lease (§5.6)         |

The **lockstep** walks `out(P)` forward and `in(C)` outward from the cursor in
both directions, one link of each per step, and stops when one side finds the
pair or is exhausted. It costs `O(min(|out(P)|, |in(C)|))` and is the only
general proof of absence. Only exhausting a covering walk may return null.

The **outgoing finger** is a hint of another consumer. For
`OUTGOING_FINGER_BUDGET` (8) rounds, each round probes the ring of `out(P)`
around the finger once and then takes one plain lockstep step; then the
plain lockstep continues. The race adds at most one probe per round, so it
never delays the proof by more than the budget.

### 5.4 Cleanup

`cleanupUnvisitedSources` is the only place tracking removes edges: after a
successful pass, and after a failed pass of a computed, it unlinks the suffix.
A failed watcher keeps its suffix as a conservative retry set. During a pass
suffix edges are attached but carry no causal authority (push requires
`Computing` plus prefix membership). Which edges survive decides edge
identity and subscriber order: representation, not semantics.

Throws undo no links, moves or stamps. Recovery restores bits only:

| Failure                     | State after                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| computed callback           | `Changed`: the next read retries                                                                 |
| watcher validation          | `Unknown` plus the retained `Changed`, `Visited` and `Scheduled`; a later run retries validation |
| watcher callback or cleanup | as a validation failure when a dependency is still dirty, otherwise idle                         |

A failed watcher is never retried inside the failing drain (L5, W3).

### 5.5 INV-H: one slot, two readings

The frontier reading of `tailIn` is needed only while the node is
`Computing`. Otherwise the slot is null, the residual incoming edge of the
last pass, or a **hint**: an attached outgoing edge with
`from === node && to !== node`. A self-edge always reads as incoming.

1. The lookup writes a hint only with an edge it located past its constant
   probes, and only into a node that is neither `Computing` nor a watcher.
2. Every unlink clears a hint pointing to the removed edge (`unlinkEdge`,
   `unlinkDetachedIncomingEdgeSequence`, `unlinkAllSubscribers`).
3. Every computation resets the slot to null before its first read.

So the slot holds only attached edges (outside raw kernel use; MODEL.md §3
lists the two anomalies). A hint of this pair is the answer; any
other is a finger. A hint never proves absence. A new edge-removal path must
clear hints too. Source: `src/kernel/shape/graph/hint.ts`.

### 5.6 INV-P: the prepared tape

A tracking pass is named by (consumer, pass stamp). A lookup of a computing
consumer **strikes** when it enters the plain lockstep or its finger race
settles past six probes. The second strike of a pass **prepares** the tape:
one walk of the consumer's incoming list writes each idle producer's slot to
its own edge and sets `Leased`. Nothing is linked, moved, unlinked or
restamped, so a throw anywhere leaves the graph the lookup would have left.

- **Lease.** One owner at a time, live while the owner is `Computing` with a
  frontier carrying the prepared stamp. Released (bits cleared over the
  owner's current list) by the owner's next miss past a dead lease, by the
  next prepare, and before cleanup or disposal remove the owner's edges.
- **Coverage.** While a lease is recorded, every link to its owner gives the
  producer a cell and the bit; a producer that is `Computing` or a watcher
  withdraws the certificate instead, as it does during the prepare.
- **Certificate.** Under a covered live lease, a hint miss on an idle producer
  without `Leased` proves it has no edge to the owner.
- **Safety.** `Leased` is only a maybe. A lost cell (the producer's own
  computation, another lookup's hint) sends the lookup to the exact search: it
  costs a lookup, never a second edge for a pair.

Disposal also drops the consumer from the strike register, so the register
never retains a disposed node. Source: `src/kernel/shape/graph/tape.ts`.

## 6. Stacks and nesting

Push and pull keep explicit reusable stacks. Each invocation owns the slice
from its entry `base` to `top`; `high` publishes occupied storage before a
reentrant call. Every exit, including throws, restores the entry base and
clears only its own slots. Trimming happens only at the outermost boundary:
push keeps 512 slots, pull at most 256.

Nested computation restores the active consumer; cleanup and `untracked`
clear it and restore it on throw. A write that opens a propagation scope owns
its abort path; a nested write borrows the scope and must not clear it.

## 7. Contexts

Contexts isolate registers and configuration, not graph ownership. A switch
copies live module registers to the outgoing context and loads the incoming
one; traversal storage stays shared, protected by invocation slices.

- `trackingStamp` is not per context: a load keeps the newer epoch,
  `setTrackingStamp` only moves it forward, reset does not rewind it.
- `snapshotRuntimeContext` restores at a quiescent boundary of that context,
  or to a checkpoint of an enclosing frame still on the stack. It never
  touches the epoch.
- `configureRuntimeContext` on the active context reloads configuration only,
  never execution registers.
- DEV+PROFILE diagnostic state (phase stack, hook stack, recompute depth)
  belongs to the context that entered it and is switched with it.
- `resetRuntimeContext` rejects a context suspended below the active one;
  resetting the active context asserts none of its continuations will resume.

## 8. Build modes

| Behavior                                           | Production | DEV                                | PROFILE |
| -------------------------------------------------- | ---------- | ---------------------------------- | ------- |
| phase stacks, hook reentry checks, cycle detection | off        | on (scheduler policy with PROFILE) | —       |
| producer/consumer role bits                        | 0          | set                                | 0       |
| debug events                                       | off        | on                                 | —       |
| projection counters                                | off        | —                                  | on      |
| kernel decisions                                   | identical  | identical except policy throws     | identical |

Graphs are assumed acyclic; cycles are detected only in DEV.
