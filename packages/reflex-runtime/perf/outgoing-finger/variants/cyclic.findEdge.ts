import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import { Computing, Watcher } from "@runtime/kernel/shape/meta";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { observeRuntimeProjection } from "@runtime/kernel/projection";

// Research variant "cyclic" of findEdge.ts (perf/outgoing-finger/README.md):
// only findEdgeInLockstep differs from the base revision.

export function findEdgeInLockstep(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
): ReactiveEdge | null {
  // Outgoing finger: with a hint, the outgoing side of the lockstep starts
  // right after it and wraps around; without one, the head start and the
  // lockstep from firstOut as before.
  const hint = producer.tailIn;
  let edge: ReactiveEdge | null;
  if (hint !== null && hint.from === producer) {
    if (hint.to === consumer) return hint;
    edge = findEdgeFromOutgoingFinger(producer, consumer, hint, back, ahead);
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
 * The lockstep with the outgoing side walked cyclically from `finger.nextOut`
 * back to `finger`, which the caller compared: every outgoing edge but the
 * finger, so an exhausted outgoing side still proves absence.
 */
function findEdgeFromOutgoingFinger(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  finger: ReactiveEdge,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
): ReactiveEdge | null {
  let out = finger.nextOut;
  // The finger is attached, so the list is not empty.
  if (out === null) out = producer.firstOut!;

  while (out !== finger) {
    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.tracking.locate.step");

    if (out.to === consumer) return out;
    out = out.nextOut;
    if (out === null) out = producer.firstOut!;

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
