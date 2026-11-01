import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import { Computing, Watcher } from "@runtime/kernel/shape/meta";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { observeRuntimeProjection } from "@runtime/kernel/projection";

// Research variant "ring" of findEdge.ts (perf/outgoing-finger/README.md):
// only findEdgeInLockstep differs from the base revision.

export function findEdgeInLockstep(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
): ReactiveEdge | null {
  // Outgoing finger: with a hint, the outgoing side of the lockstep walks
  // both ways from it, alternately, around the ring; without one, the head start and the lockstep from
  // firstOut as before.
  const hint = producer.tailIn;
  let edge: ReactiveEdge | null;
  if (hint !== null && hint.from === producer) {
    if (hint.to === consumer) return hint;
    edge = findEdgeAroundOutgoingFinger(producer, consumer, hint, back, ahead);
  } else {
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

    edge = findEdgeInLockstepPastHeadStart(producer, consumer, out, back, ahead);
  }

  if (edge !== null && (producer.state & (Computing | Watcher)) === 0) {
    producer.tailIn = edge;
  }

  return edge;
}

/**
 * The lockstep with one outgoing link per step, as the base lockstep, taken
 * alternately after and before `finger`, which the caller compared, on the
 * outgoing list read as a ring (past lastOut comes firstOut). The edges not
 * yet compared form the ring interval `after`..`before`; comparing the
 * last of them proves absence on the outgoing side.
 */
function findEdgeAroundOutgoingFinger(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  finger: ReactiveEdge,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
): ReactiveEdge | null {
  // The finger is attached, so the ring is not empty.
  let after = finger.nextOut ?? producer.firstOut!;
  let before = finger.prevOut ?? producer.lastOut!;
  if (after === finger) return null;

  for (let forward = true; ; forward = !forward) {
    if (__PROFILE__)
        observeRuntimeProjection?.("projection.semantic.tracking.locate.step");

    if (forward) {
      if (after.to === consumer) return after;
      if (after === before) return null;
      after = after.nextOut ?? producer.firstOut!;
    } else {
      if (before.to === consumer) return before;
      if (before === after) return null;
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
