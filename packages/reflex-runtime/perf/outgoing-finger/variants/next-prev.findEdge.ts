import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import { Computing, Watcher } from "@runtime/kernel/shape/meta";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { observeRuntimeProjection } from "@runtime/kernel/projection";

// Research variant "next-prev" of findEdge.ts (perf/outgoing-finger/README.md):
// only findEdgeInLockstep differs from the base revision.

export function findEdgeInLockstep(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
): ReactiveEdge | null {
  // Outgoing finger: the hint, then the subscribers after and before it.
  const hint = producer.tailIn;
  if (hint !== null && hint.from === producer) {
    if (hint.to === consumer) return hint;

    const next = hint.nextOut;
    if (next !== null) {
      if (__PROFILE__)
        observeRuntimeProjection?.("projection.semantic.tracking.locate.step");
      if (next.to === consumer) {
        if ((producer.state & (Computing | Watcher)) === 0) producer.tailIn = next;
        return next;
      }
    }

    const prev = hint.prevOut;
    if (prev !== null) {
      if (__PROFILE__)
        observeRuntimeProjection?.("projection.semantic.tracking.locate.step");
      if (prev.to === consumer) {
        if ((producer.state & (Computing | Watcher)) === 0) producer.tailIn = prev;
        return prev;
      }
    }
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
