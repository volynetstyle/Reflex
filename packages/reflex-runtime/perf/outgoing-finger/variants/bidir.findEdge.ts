import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import { Computing, Watcher } from "@runtime/kernel/shape/meta";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { observeRuntimeProjection } from "@runtime/kernel/projection";

// Research variant "bidir" of findEdge.ts (perf/outgoing-finger/README.md):
// only findEdgeInLockstep differs from the base revision.

export function findEdgeInLockstep(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
): ReactiveEdge | null {
  // Outgoing finger: with a hint, the outgoing side of the lockstep walks
  // both ways from it; without one, the head start and the lockstep from
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
 * The lockstep with two outgoing walkers, after and before `finger`, which
 * the caller compared: exhausting both covers the outgoing list.
 */
function findEdgeAroundOutgoingFinger(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  finger: ReactiveEdge,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
): ReactiveEdge | null {
  let after = finger.nextOut;
  let before = finger.prevOut;

  while (after !== null || before !== null) {
    if (after !== null) {
      if (__PROFILE__)
        observeRuntimeProjection?.("projection.semantic.tracking.locate.step");

      if (after.to === consumer) return after;
      after = after.nextOut;
    }

    if (before !== null) {
      if (__PROFILE__)
        observeRuntimeProjection?.("projection.semantic.tracking.locate.step");

      if (before.to === consumer) return before;
      before = before.prevOut;
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

  return null;
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
