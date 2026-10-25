import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
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

  // JIT: plain loops, not unrolled. This is the cold search behind every
  // locality tier; its size counts against the inlining budget of each caller.
  // PROFILE: one locate.step per link compared, on either side.
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
