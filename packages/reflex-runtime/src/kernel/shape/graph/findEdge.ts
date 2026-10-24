import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import { Computing, Watcher } from "@runtime/kernel/shape/meta";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { observeRuntimeProjection } from "@runtime/kernel/projection";

const OUTGOING_HEAD_START = 4;

/**
 * Find the edge `producer -> consumer`, or prove that there is none.
 *
 * A pair has at most one edge, and that edge is on both the producer's
 * outgoing list and the consumer's incoming list. The search walks both lists
 * in lockstep and stops when either side finds it or runs out, so a lookup
 * costs O(min(out(producer), in(consumer)) + 4) links whichever side is
 * short.
 *
 * The outgoing side is walked from `producer.firstOut`. The incoming side is
 * walked outward from a known position: `back` follows `prevIn`, `ahead`
 * follows `nextIn`. Together with the incoming edges the caller has already
 * compared, they must cover the whole incoming list: an exhausted incoming
 * side is then a proof of absence.
 *
 * Past the four-link head start, the producer's outgoing hint is consulted
 * before the lockstep and refreshed after it (INV-H, see
 * `isOutgoingHint`). A hint is a positive answer only: it is used when it is
 * an attached edge of exactly this pair, and a miss proves nothing, so
 * absence is still proved by the lockstep.
 */
export function findEdgeInLockstep(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
): ReactiveEdge | null {
  let out = producer.firstOut;

  // Most producers have a few subscribers, and their outgoing list alone
  // settles the lookup. The incoming side joins after these links, which
  // adds a constant to the bound, not a factor.
  for (let probed = 0; probed < OUTGOING_HEAD_START; ++probed) {
    if (out === null) return null;
    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.tracking.locate.step");
    if (out.to === consumer) return out;
    out = out.nextOut;
  }

  // A wide producer remembers the edge of its last expensive lookup. A
  // repeated read of the same pair, such as a broad producer re-read inside
  // a wide consumer, then costs one comparison instead of a walk. Under
  // INV-H whatever the slot holds is attached, whichever reading it is in,
  // and a pair has at most one edge: an edge from this producer to this
  // consumer is the answer.
  const hint = producer.tailIn;
  if (hint !== null && hint.to === consumer && hint.from === producer) {
    return hint;
  }

  const edge = findEdgeInLockstepPastHeadStart(
    producer,
    consumer,
    out,
    back,
    ahead,
  );

  // The slot is written only while the producer is not Computing, so it
  // never replaces a tracking frontier, and never on a watcher, whose slot
  // pull_frontier saves and restores. A self-read comes from the computing
  // consumer itself, so no self-edge is written here; a self-edge in a slot
  // would read as incoming in any case.
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
  for (;;) {
    if (out === null) return null;
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
}
