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
      : findEdgeInLockstepPastHeadStart(producer, consumer, out, back, ahead);

  // The slot is written only while the producer is neither Computing nor a
  // Watcher, so it cannot replace a tracking frontier or interfere with the
  // slot state saved and restored by pull_frontier. A self-read originates
  // from the computing consumer itself, so this path cannot install a
  // self-edge; if one were present, it would be interpreted as incoming.
  if (edge !== null && (producer.state & (Computing | Watcher)) === 0) {
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
  if (preparedOwner === consumer && ownerMissIsAbsent(producer, consumer) === true) return null;
  let after = finger.nextOut ?? producer.firstOut!;
  let before = finger.prevOut ?? producer.lastOut!;

  for (let step = 0; step < 12; step++) {
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

  return findEdgeFingerTail(producer, consumer, after, before, out, back, ahead);
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
  if ((consumer.state & Computing) !== 0) {
    const settled = lockstepEntry(producer, consumer);
    if (settled !== undefined) return settled;
  }
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


/*
 * Lean v3 = lean v2 (membership bit) with findEdgeInLockstep byte-identical:
 * the owner test sits at the entry of the two continuations, which the
 * baseline only reaches past the head start. Measured: findEdgeInLockstep
 * has ~20 bytes of cumulative budget in A.track.hub-duplicate, and the owner
 * line cost 31; the continuations are not inlined there.
 *
 * Lean v2 notes follow.
 *
 * Lean v2: the frameless prepared tape with membership carried by a state
 * bit instead of by the cell surviving in its slot.
 *
 * Measured on Node 24 (inlining.mjs): advanceCore has 2-6 bytes of
 * cumulative inlining budget left in fan-out callers, so no keep/restore can
 * live there in any form. Here nothing does: a producer's computation may
 * clear its cell; the bit, which every computation preserves (state is
 * always derived from itself), still says "edge to the owner may exist".
 *
 * Invariant under a live lease with coverage: every producer of an attached
 * incoming edge of the owner has LEASED set. Hence an idle producer without
 * the bit has no edge to the owner: a hint miss on it certifies absence. A
 * bit is only a "maybe": a miss on a producer with the bit takes the exact
 * lookup, which rewrites the cell or, on absence, clears the stale bit. A
 * cell is a fast positive only, so overwriting one (nested hint writes, a
 * computation entry, the raw kernel API) costs a lookup, never a twin.
 */

// Substituted per variant by build.mjs. PREPARE_STRIKES = 0 never prepares.
const PREPARE_STRIKES: number = 2;
const CERTIFY_ABSENCE: boolean = true;
// Substituted by build.mjs: 2 x FINGER_STRIKE_PROBES.
const FINGER_SPLIT: number = 12;
/** Free state bit (meta.ts: 0..8 used; 29, 30 dev-only). */
const LEASED = 1 << 9;

let strikeOwner: ReactiveNode | null = null;
let strikeStamp = 0;
let strikeCount = 0;

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

/** Ends the lease: clears the bits of the owner's current producers. */
function releaseLease(): void {
  const owner = preparedOwner!;
  for (let edge = owner.firstIn; edge !== null; edge = edge.nextIn) {
    edge.from.state &= ~LEASED;
  }
  preparedOwner = null;
  preparedStats.released++;
}

/**
 * Continuation entry (finger race or plain lockstep) of a lookup by the
 * recorded owner: true when the miss certifies absence; false to continue
 * the exact walk (whose hint write puts a found cell back, and whose link,
 * on absence, puts the producer on the tape through notePreparedLink).
 */
export function ownerMissIsAbsent(
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
  const state = producer.state;
  if (
    CERTIFY_ABSENCE &&
    preparedCovered &&
    (state & (Computing | Watcher | LEASED)) === 0 &&
    producer !== consumer
  ) {
    preparedStats.certified++;
    return true;
  }
  preparedStats.fallbacks++;
  return false;
}

/**
 * Plain-lockstep entry of a computing consumer: the owner's certificate,
 * then a strike. Returns the answer when the tape settles it (cell hit or
 * certified absence), undefined to run the lockstep.
 */
export function lockstepEntry(
  producer: ReactiveNode,
  consumer: ReactiveNode,
): ReactiveEdge | null | undefined {
  if (preparedOwner === consumer) {
    return ownerMissIsAbsent(producer, consumer) === true ? null : undefined;
  }
  if (PREPARE_STRIKES === 0 || strikeReachesPrepare(consumer) === false) {
    return undefined;
  }
  const cell = producer.tailIn;
  if (cell !== null && cell.to === consumer && cell.from === producer) {
    return cell;
  }
  return ownerMissIsAbsent(producer, consumer) === true ? null : undefined;
}

/** The finger window's last probes; a hit here strikes (far-finger rule). */
export function findEdgeFingerTail(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  after: ReactiveEdge,
  before: ReactiveEdge,
  out: ReactiveEdge | null,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
): ReactiveEdge | null {
  for (let step = FINGER_SPLIT; step < 16; step++) {
    if ((step & 1) === 1) {
      if (out === null) return null;
      if (out.to === consumer) return farHit(out, consumer);
      out = out.nextOut;
    } else if ((step & 2) === 0) {
      if (after.to === consumer) return farHit(after, consumer);
      after = after.nextOut ?? producer.firstOut!;
    } else {
      if (before.to === consumer) return farHit(before, consumer);
      before = before.prevOut ?? producer.lastOut!;
    }
    if (back !== null) {
      if (back.from === producer) return farHit(back, consumer);
      back = back.prevIn;
    }
    if (ahead !== null) {
      if (ahead.from === producer) return farHit(ahead, consumer);
      ahead = ahead.nextIn;
    } else if (back === null) {
      return null;
    }
  }
  return findEdgeInLockstepPastHeadStart(producer, consumer, out, back, ahead);
}

function farHit(edge: ReactiveEdge, consumer: ReactiveNode): ReactiveEdge {
  if (PREPARE_STRIKES !== 0 && (consumer.state & Computing) !== 0) {
    strikeReachesPrepare(consumer);
  }
  return edge;
}

function strikeReachesPrepare(consumer: ReactiveNode): boolean {
  const stamp = passStampOf(consumer);
  if (strikeOwner !== consumer || strikeStamp !== stamp) {
    strikeOwner = consumer;
    strikeStamp = stamp;
    strikeCount = 0;
  }
  preparedStats.strikes++;
  if (++strikeCount < PREPARE_STRIKES) return false;

  if (preparedOwner !== null) {
    if (preparedOwner === consumer && preparedStamp === stamp) return false;
    if (leaseIsLive() === true) return false;
    releaseLease();
  }

  prepareIncomingTape(consumer, stamp);
  return true;
}

function prepareIncomingTape(consumer: ReactiveNode, stamp: number): void {
  let covered = true;
  let cells = 0;
  for (
    let edge: ReactiveEdge | null = consumer.firstIn;
    edge !== null;
    edge = edge.nextIn
  ) {
    const producer = edge.from;
    if ((producer.state & (Computing | Watcher)) === 0) {
      producer.state |= LEASED;
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

/** A new edge into the recorded owner: its producer joins the tape. */
export function notePreparedLink(edge: ReactiveEdge): void {
  const producer = edge.from;
  if ((producer.state & (Computing | Watcher)) === 0) {
    producer.state |= LEASED;
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
