import { trackingStamp } from "@runtime/kernel/state";
import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import { Computing, Watcher } from "@runtime/kernel/shape/meta";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { observeRuntimeProjection } from "@runtime/kernel/projection";

/**
 * Outgoing links the lookup may take from around the producer's finger
 * before its outgoing side is the base walk alone. The finger's whole cost
 * when it does not help: see findEdgeInLockstepFromFinger.
 */
// const OUTGOING_FINGER_BUDGET = 8;

/**
 * Find the edge `producer -> consumer`, or prove that there is none.
 *
 * A pair has at most one edge, and that edge is on both the producer's
 * outgoing list and the consumer's incoming list. The search first probes
 * two outgoing edges, then walks both lists in lockstep until either side
 * finds the pair or proves that it is absent. A lookup therefore costs
 * O(min(out(producer), in(consumer)) + 2) links whichever side is short,
 * plus a bounded constant when the producer holds a finger.
 *
 * The outgoing side is walked from `producer.firstOut`. The incoming side is
 * walked outward from a known position: `back` follows `prevIn`, `ahead`
 * follows `nextIn`. Together with the incoming edges the caller has already
 * compared, they must cover the whole incoming list. Exhausting that covered
 * incoming search is therefore a proof of absence.
 *
 * The producer's slot (INV-H, see `isOutgoingHint`) is consulted twice. An
 * edge of exactly this pair is the answer, before anything else. Any other
 * edge from the producer is a finger: the edge found by the last lookup of
 * this producer past its head start. `P.out` is append-only, so it lists the
 * consumers in the order they linked the producer, which is the order they
 * ran; consumers that re-run in that order find their edge near the previous
 * consumer's, however each orders its own reads. Past the head start the
 * lockstep therefore also races a bounded walk around the finger
 * (findEdgeInLockstepFromFinger). The edge found by either becomes the hint.
 *
 * Hint and finger are positive answers only: a miss proves nothing, and
 * absence is established only by exhausting the outgoing or the covered
 * incoming search.
 */
export function findEdgeInLockstep(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
): ReactiveEdge | null {
  // A wide producer remembers the edge found by its last expensive lookup.
  // Repeating the same pair lookup can then cost one comparison instead of
  // another walk. Under INV-H the slot contains only an attached edge, and
  // pair identity is unique, so an edge from this producer to this consumer
  // is the answer.
  //
  // The probe comes before the two outgoing probes because a hit would
  // otherwise pay for them first. Producers whose lookups never reach the
  // expensive path still pay only this load and comparison and never refresh
  // the slot.
  const hint = producer.tailIn;
  if (hint !== null && hint.to === consumer && hint.from === producer) {
    return hint;
  }

  // A miss in a leased tape may certify absence (cold: one compare).
  if (preparedOwner === consumer && preparedMissIsAbsent(producer, consumer) === true) {
    return null;
  }

  let out = producer.firstOut;

  if (out === null) return null;
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.tracking.locate.step");
  if (out.to === consumer) return out;

  out = out.nextOut;

  if (out === null) return null;
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.tracking.locate.step");
  if (out.to === consumer) return out;

  out = out.nextOut;

  if (out === null) return null;

  // The head start answers without touching the slot, as without a finger:
  // a consumer at the head of the list never displaces another consumer's
  // hint. A slot edge from the producer is on its outgoing list (a hint, or
  // a self-edge in its incoming reading) and attached either way.
  const edge =
    hint !== null && hint.from === producer
      ? findEdgeInLockstepFromFinger(producer, consumer, hint, out, back, ahead)
      : findEdgeAfterLocality(producer, consumer, out, back, ahead);

  // The slot is written only while the producer is neither Computing nor a
  // Watcher, so it cannot replace a tracking frontier or interfere with the
  // slot state saved and restored by pull_frontier. A self-read originates
  // from the computing consumer itself, so this path cannot install a
  // self-edge; if one were present, it would be interpreted as incoming.
  if (edge !== null && (producer.state & (Computing | Watcher)) === 0 && (preparedOwner === null || holdsLiveCell(producer) === false)) {
    producer.tailIn = edge;
  }

  return edge;
}

const FIRST_WALK = 1 << 0;
const SECOND_WALK = 1 << 1;

/**
 * The lockstep past the head start, raced against the finger: for its first
 * 2 × OUTGOING_FINGER_BUDGET steps the outgoing link alternates between the
 * base walk from `out` and the producer's outgoing list read as a ring
 * around `finger` (past `lastOut` comes `firstOut`), alternately after and
 * before it; then the base lockstep continues from where every walker
 * stands. The incoming walkers advance on every step, as in the base
 * lockstep.
 *
 * Nothing the base lockstep proves is given up or postponed by more than a
 * constant: an edge the incoming side reaches costs the same steps; an edge
 * the base outgoing walk reaches as its j-th link costs at most
 * min(j, OUTGOING_FINGER_BUDGET) more steps; an exhausted incoming side
 * still proves absence at once, an exhausted base walk after at most
 * OUTGOING_FINGER_BUDGET more steps. The ring compares only edges of this
 * producer, so a finger hit is exact; a finger miss proves nothing.
 *
 * JIT: a separate loop, not a flag in findEdgeInLockstepPastHeadStart, so a
 * call site that never meets a finger inlines only the base lockstep.
 * PROFILE: one locate.step per link compared, on either side.
 */
function findEdgeInLockstepFromFinger(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  finger: ReactiveEdge,
  out: ReactiveEdge | null,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
): ReactiveEdge | null {
  let after = finger.nextOut ?? producer.firstOut!;
  let before = finger.prevOut ?? producer.lastOut!;

  for (let step = 0; step < 16 /**2 * OUTGOING_FINGER_BUDGET*/; step++) {
    {
      if (__PROFILE__)
        observeRuntimeProjection?.("projection.semantic.tracking.locate.step");
    }
    if ((step & FIRST_WALK) === 1) {
      // The base outgoing walk, at half its usual pace.
      if (out === null) {
        return null;
      }

      if (out.to === consumer) {
        return out;
      }

      out = out.nextOut;
    } else if ((step & SECOND_WALK) === 0) {
      if (after.to === consumer) {
        return after;
      }

      after = after.nextOut ?? producer.firstOut!;
    } else {
      if (before.to === consumer) {
        return before;
      }

      before = before.prevOut ?? producer.lastOut!;
    }

    if (back !== null) {
      {
        if (__PROFILE__)
          observeRuntimeProjection?.(
            "projection.semantic.tracking.locate.step",
          );
      }

      if (back.from === producer) {
        return back;
      }

      back = back.prevIn;
    }

    if (ahead !== null) {
      {
        if (__PROFILE__)
          observeRuntimeProjection?.(
            "projection.semantic.tracking.locate.step",
          );
      }

      if (ahead.from === producer) {
        return ahead;
      }

      ahead = ahead.nextIn;
    } else if (back === null) {
      return null;
    }
  }

  return findEdgeAfterLocality(producer, consumer, out, back, ahead);
}

/**
 * The lockstep proper, entered with `out` positioned after the head start.
 *
 * JIT: plain loops, not unrolled. This is the cold search behind every
 * locality tier; its size counts against the inlining budget of each caller.
 * PROFILE: one locate.step per link compared, on either side.
 */
function findEdgeInLockstepPastHeadStart(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  out: ReactiveEdge | null,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
): ReactiveEdge | null {
  while (out !== null) {
    {
      if (__PROFILE__)
        observeRuntimeProjection?.("projection.semantic.tracking.locate.step");
    }
    if (out.to === consumer) {
      return out;
    }

    out = out.nextOut;

    if (back !== null) {
      {
        if (__PROFILE__)
          observeRuntimeProjection?.(
            "projection.semantic.tracking.locate.step",
          );
      }
      if (back.from === producer) {
        return back;
      }

      back = back.prevIn;
    }

    if (ahead !== null) {
      {
        if (__PROFILE__)
          observeRuntimeProjection?.(
            "projection.semantic.tracking.locate.step",
          );
      }
      if (ahead.from === producer) {
        return ahead;
      }

      ahead = ahead.nextIn;
    } else if (back === null) {
      return null;
    }
  }

  return null;
}


// Substituted per variant by build.mjs. PREPARE_STRIKES = 0 never prepares
// (the scaffold: every hook present, the tape never addressed).
const PREPARE_STRIKES: number = 2;
const CERTIFY_ABSENCE: boolean = true;

/*
 * No frame stack. A tracking pass is named by (consumer, pass stamp); the
 * stamp alone is not unique across consumers (a nested execution and its
 * parent's first read can share one).
 *
 * Strikes: lookups of the current (consumer, stamp) that left the locality
 * tiers for the plain lockstep. Another pass striking in between restarts
 * the count, so nesting only ever delays a prepare.
 */
let strikeOwner: ReactiveNode | null = null;
let strikeStamp = 0;
let strikeCount = 0;

/*
 * Lease: (preparedOwner, preparedStamp). Live(C, s) holds while C is
 * Computing and its frontier carries s. A dead lease needs no eager
 * cleanup: its cells are ordinary INV-H hints, it is replaced by the next
 * prepare and released by the next computation entry that meets it.
 */
export let preparedOwner: ReactiveNode | null = null;
let preparedStamp = 0;
let preparedCovered = false;

/** Research counters; incremented on cold paths only. */
export const preparedStats = {
  strikes: 0,
  prepares: 0,
  cells: 0,
  uncovered: 0,
  fallbacks: 0,
  certified: 0,
  kept: 0,
  released: 0,
};

/** The stamp the resolver gives the next read of a computing consumer. */
function passStampOf(consumer: ReactiveNode): number {
  const cursor = consumer.tailIn;
  return cursor !== null ? cursor.stamp : trackingStamp;
}

function leaseIsLive(): boolean {
  const owner = preparedOwner!;
  return (
    (owner.state & Computing) !== 0 && passStampOf(owner) === preparedStamp
  );
}

function releaseLease(): void {
  preparedOwner = null;
  preparedStats.released++;
}

/** Structural: `node`'s slot is its cell of the owner's tape (live or not). */
export function holdsPreparedCell(node: ReactiveNode): boolean {
  const cell = node.tailIn;
  return (
    cell !== null &&
    cell.to === preparedOwner &&
    cell.from === node &&
    node !== preparedOwner
  );
}

/** Hint-write guard: never overwrite a cell of a live lease. */
export function holdsLiveCell(node: ReactiveNode): boolean {
  if (holdsPreparedCell(node) === false) return false;
  if (leaseIsLive() === true) return true;
  releaseLease();
  return false;
}

/**
 * After a hint miss of `producer -> consumer` while `consumer` holds the
 * lease: whether the miss proves absence. Coverage invariant: under a live
 * lease every attached incoming edge of the owner is its producer's slot,
 * except while that producer computes (its cell is then kept by its own
 * computation entry, and it is Computing). So a miss on an idle producer
 * certifies absence; no frame depth is consulted.
 */
export function preparedMissIsAbsent(
  producer: ReactiveNode,
  consumer: ReactiveNode,
): boolean {
  if (
    (consumer.state & Computing) === 0 ||
    passStampOf(consumer) !== preparedStamp
  ) {
    releaseLease();
    return false;
  }

  if (
    CERTIFY_ABSENCE &&
    preparedCovered &&
    producer !== consumer &&
    (producer.state & (Computing | Watcher)) === 0
  ) {
    preparedStats.certified++;
    return true;
  }

  preparedStats.fallbacks++;
  return false;
}

/**
 * The lookup is about to leave the locality tiers (hint, head start, finger
 * window) for the plain lockstep: a strike. On the PREPARE_STRIKES-th of
 * this pass, prepare the tape and answer from it; otherwise, or when another
 * live lease exists, the lockstep proceeds.
 */
export function findEdgeAfterLocality(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  out: ReactiveEdge | null,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
): ReactiveEdge | null {
  if (PREPARE_STRIKES !== 0 && strikeReachesPrepare(consumer) === true) {
    const cell = producer.tailIn;
    if (cell !== null && cell.to === consumer && cell.from === producer) {
      return cell;
    }
    if (preparedMissIsAbsent(producer, consumer) === true) return null;
  }

  return findEdgeInLockstepPastHeadStart(producer, consumer, out, back, ahead);
}

function strikeReachesPrepare(consumer: ReactiveNode): boolean {
  // Outside a pass (low-level calls) a lookup never strikes.
  if ((consumer.state & Computing) === 0) return false;

  const stamp = passStampOf(consumer);
  if (strikeOwner !== consumer || strikeStamp !== stamp) {
    strikeOwner = consumer;
    strikeStamp = stamp;
    strikeCount = 0;
  }
  preparedStats.strikes++;
  if (++strikeCount < PREPARE_STRIKES) return false;

  if (preparedOwner !== null) {
    // Already prepared in this pass (a hit-only miss came back here), or
    // another live lease: single owner, no rollback.
    if (preparedOwner === consumer && preparedStamp === stamp) return false;
    if (leaseIsLive() === true) return false;
  }

  prepareIncomingTape(consumer, stamp);
  return true;
}

/**
 * Address the consumer's incoming tape: one O(in) pass writing each
 * producer's slot. Links, moves and stamps are untouched, so a throw at any
 * later point leaves exactly the graph the baseline leaves.
 */
function prepareIncomingTape(consumer: ReactiveNode, stamp: number): void {
  let covered = true;
  let cells = 0;

  for (
    let edge: ReactiveEdge | null = consumer.firstIn;
    edge !== null;
    edge = edge.nextIn
  ) {
    const producer = edge.from;
    // The hint-write rule (INV-H): a Computing node's slot is a frontier, a
    // watcher's is saved and restored by validation. A self-edge comes from
    // the computing consumer itself.
    if ((producer.state & (Computing | Watcher)) === 0) {
      producer.tailIn = edge;
      cells++;
    } else {
      covered = false;
    }
  }

  preparedOwner = consumer;
  preparedStamp = stamp;
  preparedCovered = covered;
  preparedStats.prepares++;
  preparedStats.cells += cells;
  if (!covered) preparedStats.uncovered++;
}

/**
 * Computation entry of `node`, called only while a lease is recorded: the
 * live owner's cell that `node`'s frontier is about to replace, or null. A
 * dead lease is released here, so later entries see `preparedOwner === null`.
 */
export function keepPreparedCell(node: ReactiveNode): ReactiveEdge | null {
  if (leaseIsLive() === false) {
    releaseLease();
    return null;
  }
  if (holdsPreparedCell(node) === false) return null;
  preparedStats.kept++;
  return node.tailIn;
}

/**
 * Computation exit, by return or throw: put the kept cell back while it is
 * attached. Live lease or not, an attached outgoing edge is a valid hint.
 */
export function restorePreparedCell(
  node: ReactiveNode,
  cell: ReactiveEdge,
): void {
  if (cell.prevOut !== null || node.firstOut === cell) node.tailIn = cell;
}

/** A new edge into the owner gets its cell, or coverage is lost. */
export function notePreparedLink(edge: ReactiveEdge): void {
  const producer = edge.from;
  if ((producer.state & (Computing | Watcher)) === 0) {
    producer.tailIn = edge;
  } else {
    preparedCovered = false;
  }
}

/** Read-only research inspection; never called by runtime paths. */
export function preparedTrackingState(): {
  owner: ReactiveNode | null;
  stamp: number;
  live: boolean;
  covered: boolean;
} {
  return {
    owner: preparedOwner,
    stamp: preparedStamp,
    live: preparedOwner !== null && leaseIsLive(),
    covered: preparedCovered,
  };
}

export function resetPreparedStats(): void {
  for (const key of Object.keys(preparedStats) as (keyof typeof preparedStats)[]) {
    preparedStats[key] = 0;
  }
}
