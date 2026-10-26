import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import { Computing, Watcher } from "@runtime/kernel/shape/meta";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { observeRuntimeProjection } from "@runtime/kernel/projection";

//const OUTGOING_HEAD_START = 2;
/**
 * Find the edge `producer -> consumer`, or prove that there is none.
 *
 * A pair has at most one edge, and that edge is on both the producer's
 * outgoing list and the consumer's incoming list. The search first probes
 * two outgoing edges, then walks both lists in lockstep until either side
 * finds the pair or proves that it is absent. A lookup therefore costs
 * O(min(out(producer), in(consumer)) + 2) links whichever side is short.
 *
 * The outgoing side is walked from `producer.firstOut`. The incoming side is
 * walked outward from a known position: `back` follows `prevIn`, `ahead`
 * follows `nextIn`. Together with the incoming edges the caller has already
 * compared, they must cover the whole incoming list. Exhausting that covered
 * incoming search is therefore a proof of absence.
 *
 * The producer's outgoing hint is consulted first and refreshed only after
 * the two-link head start and lockstep search (INV-H, see `isOutgoingHint`).
 * A hint is a positive answer only: it is accepted only when it is an attached
 * edge of exactly this pair. A hint miss proves nothing, so absence is still
 * established by exhausting the outgoing or covered incoming search.
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

  const edge = findEdgeInLockstepPastHeadStart(
    producer,
    consumer,
    out,
    back,
    ahead,
  );

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
