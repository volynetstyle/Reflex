import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import { Computing, Watcher } from "@runtime/kernel/shape/meta";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { observeRuntimeProjection } from "@runtime/kernel/projection";

// Research variant "mix-b12" of findEdge.ts (perf/outgoing-finger/README.md):
// only findEdgeInLockstep differs from the base revision.

export function findEdgeInLockstep(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
): ReactiveEdge | null {
  // Base exact probe and head start, unchanged; past them, with a finger, a
  // lockstep whose outgoing link alternates with 12 links around the finger.
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

  const edge =
    hint !== null && hint.from === producer
      ? findEdgeInLockstepFromFinger(producer, consumer, hint, out, back, ahead)
      : findEdgeInLockstepPastHeadStart(producer, consumer, out, back, ahead);

  if (edge !== null && (producer.state & (Computing | Watcher)) === 0) {
    producer.tailIn = edge;
  }

  return edge;
}

/**
 * The lockstep whose outgoing link, for the first 24 steps, alternates
 * between the ring around `finger` (alternately after and before it, 12
 * links in all) and the base outgoing walk from `out`; then the base
 * lockstep continues. The incoming walkers advance on every step, and the
 * base walk only slows down, so either exhaustion still proves absence.
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

  for (let step = 0; step < 24; step++) {
    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.tracking.locate.step");
    if ((step & 1) === 1) {
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
