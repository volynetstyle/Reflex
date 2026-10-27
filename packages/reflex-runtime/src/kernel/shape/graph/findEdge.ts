import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import { Computing, Watcher } from "@runtime/kernel/shape/meta";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { observeRuntimeProjection } from "@runtime/kernel/projection";

/**
 * Outgoing links the lookup may take from around the producer's finger
 * before its outgoing side is the base walk alone. The finger's whole cost
 * when it does not help: see findEdgeInLockstepFromFinger.
 */
const OUTGOING_FINGER_BUDGET = 8;

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

  for (let step = 0; step < 2 * OUTGOING_FINGER_BUDGET; step++) {
    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.tracking.locate.step");

    if ((step & 1) === 1) {
      // The base outgoing walk, at half its usual pace.
      if (out === null) return null;
      if (out.to === consumer) return out;
      out = out.nextOut;
    } else if ((step & 2) === 0) {
      if (after.to === consumer) return after;
      after = after.nextOut ?? producer.firstOut!;
    } else {
      if (before.to === consumer) return before;
      before = before.prevOut ?? producer.lastOut!;
    }

    if (back !== null) {
      if (__PROFILE__)
        observeRuntimeProjection?.("projection.semantic.tracking.locate.step");

      if (back.from === producer) return back;
      back = back.prevIn;
    }

    if (ahead !== null) {
      if (__PROFILE__)
        observeRuntimeProjection?.("projection.semantic.tracking.locate.step");

      if (ahead.from === producer) return ahead;
      ahead = ahead.nextIn;
    } else if (back === null) {
      return null;
    }
  }

  return findEdgeInLockstepPastHeadStart(producer, consumer, out, back, ahead);
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
    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.tracking.locate.step");

    if (out.to === consumer) return out;
    out = out.nextOut;

    if (back !== null) {
      if (__PROFILE__)
        observeRuntimeProjection?.("projection.semantic.tracking.locate.step");

      if (back.from === producer) return back;
      back = back.prevIn;
    }

    if (ahead !== null) {
      if (__PROFILE__)
        observeRuntimeProjection?.("projection.semantic.tracking.locate.step");

      if (ahead.from === producer) return ahead;
      ahead = ahead.nextIn;
    } else if (back === null) {
      return null;
    }
  }

  return null;
}
