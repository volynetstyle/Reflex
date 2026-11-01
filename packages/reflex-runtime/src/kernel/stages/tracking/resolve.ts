import {
  DEFAULT_READ_TRACKING_STRATEGY,
  defaultContext,
  readTrackingStrategy,
} from "@runtime/kernel/config";
import { trackingStamp } from "@runtime/kernel/state";
import { devRecordTrackRead } from "@runtime/kernel/dev";
import {
  moveTrackedIncomingEdgeAfterCursorUnchecked,
  moveTrackedIncomingEdgeToFrontUnchecked,
} from "@runtime/kernel/shape/graph/cursorMoves";
import {
  appendTrackedEdgeAfterCursorUnchecked,
  linkEdge,
  linkFirstTrackedEdgeUnchecked,
} from "@runtime/kernel/shape/graph/linkEdge";
import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { observeRuntimeProjection } from "@runtime/kernel/projection";

import { locateEdge } from "./locate";
import { isEdgeInTrackedPrefix } from "./prefix";

/**
 * Every read that resolveTrackedRead's own comparisons did not settle. One
 * handler for the three miss kinds, which the caller tells apart only by
 * `cursorEdge` (null: initial order) and its `nextIn` (null: physical tail):
 *
 * - **Initial miss:** the first read of a pass did not match the first
 *   incoming edge. Tail locality, then an exact lookup; the prefix is empty,
 *   so whatever the lookup finds is in the suffix.
 * - **Tail miss** (`cursorEdge.nextIn === null`): the suffix is empty, so
 *   every edge of the pair is in the prefix (INV-T2): the read is a
 *   duplicate exactly when the edge exists, and stamps are not consulted;
 *   otherwise it appends.
 * - **Cursor miss inside the list:** bounded reorder and tail locality, then
 *   one exact lookup that both detects a duplicate and finds a reusable edge.
 *   Every edge the locality tiers find lies after the expected next edge,
 *   which the caller compared: one or two hops past it, or the physical
 *   tail. The tail's predecessor is never the cursor, since that would make
 *   the tail the expected next edge. All three take the same move.
 *
 * The caller compared the cursor (or the first incoming edge) and the
 * expected next edge, so the incoming side of every lookup starts beside
 * them.
 *
 * JIT: one handler, never inlined. TurboFan inlines no function of more than
 * 460 bytecode bytes (--max-inlined-bytecode-size), and charges a caller for
 * a callee's bytecode plus everything already inlined into the callee's
 * optimized code, against a 920-byte budget per compilation. Split into one
 * handler per miss kind, each was small enough to be inlined into
 * resolveTrackedRead wherever it had been hot, with its lookup and
 * reconciliation, and resolveTrackedRead then no longer fit into
 * readProducer, advanceCore or the reading callback: every read, the
 * sequential ones included, paid a call. Merged, with the reconciliation in
 * its body (507 bytes on Node 24), the handler is above that limit: it stays
 * one call per miss and inlines its own lookup and graph mutations into its
 * own budget, and resolveTrackedRead (225 bytes) stays small enough for its
 * callers. Keep it above the limit when editing it.
 */
function resolveTrackedReadMiss(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  cursorEdge: ReactiveEdge | null,
): void {
  // The first suffix edge, which the caller compared; null at the tail.
  let suffixStartEdge: ReactiveEdge | null;
  let ahead: ReactiveEdge | null;

  if (cursorEdge === null) {
    suffixStartEdge = consumer.firstIn!;

    if (__TRACKING_LAST_EDGE__) {
      const lastIncomingEdge = consumer.lastIn!;

      // Not the first edge, which the caller compared.
      if (lastIncomingEdge.from === producer) {
        if (__PROFILE__)
          observeRuntimeProjection?.(
            "projection.semantic.tracking.initial.last-edge-shortcut",
          );
        moveTrackedIncomingEdgeToFrontUnchecked(
          consumer,
          lastIncomingEdge,
          trackingStamp,
        );

        devRecordTrackRead(defaultContext, consumer, producer);
        return;
      }
    }

    ahead = suffixStartEdge.nextIn;
  } else {
    suffixStartEdge = cursorEdge.nextIn;

    if (suffixStartEdge === null) {
      ahead = null;
    } else {
      const lookahead1Edge = suffixStartEdge.nextIn;
      let movedEdge: ReactiveEdge | null = null;

      if (lookahead1Edge !== null) {
        if (__TRACKING_ONE_HOP__ && lookahead1Edge.from === producer) {
          if (__PROFILE__)
            observeRuntimeProjection?.(
              "projection.semantic.tracking.reorder.one-hop",
            );
          movedEdge = lookahead1Edge;
        } else if (__TRACKING_TWO_HOP__) {
          const lookahead2Edge = lookahead1Edge.nextIn;

          if (lookahead2Edge !== null && lookahead2Edge.from === producer) {
            if (__PROFILE__)
              observeRuntimeProjection?.(
                "projection.semantic.tracking.reorder.two-hop",
              );
            movedEdge = lookahead2Edge;
          }
        }
      }

      if (__TRACKING_LAST_EDGE__ && movedEdge === null) {
        const lastIncomingEdge = consumer.lastIn!;

        if (lastIncomingEdge.from === producer) {
          if (__PROFILE__)
            observeRuntimeProjection?.(
              "projection.semantic.tracking.last-edge.shortcut",
            );
          movedEdge = lastIncomingEdge;
        }
      }

      if (movedEdge !== null) {
        moveTrackedIncomingEdgeAfterCursorUnchecked(
          consumer,
          cursorEdge,
          movedEdge,
        );
        devRecordTrackRead(defaultContext, consumer, producer);
        return;
      }

      ahead = lookahead1Edge;
    }
  }

  // A cursor miss inside the list is a reorder (locateEdge).
  const locatedEdge = locateEdge(
    producer,
    consumer,
    cursorEdge === null ? null : cursorEdge.prevIn,
    ahead,
    cursorEdge !== null && suffixStartEdge !== null,
  );

  if (cursorEdge !== null) {
    // At the tail every edge of the pair is in the prefix (INV-T2); inside
    // the list the stamp classifies it.
    // JIT: `=== true` keeps a non-inlined boolean result a single compare
    // (docs/JIT_CONTRACTS.md, canonical-boolean).
    if (
      locatedEdge !== null &&
      (suffixStartEdge === null ||
        isEdgeInTrackedPrefix(consumer, cursorEdge, locatedEdge) === true)
    ) {
      if (__PROFILE__)
        observeRuntimeProjection?.(
          "projection.semantic.tracking.prefix.duplicate",
        );
      devRecordTrackRead(defaultContext, consumer, producer);
      return;
    }

    if (suffixStartEdge === null) {
      appendTrackedEdgeAfterCursorUnchecked(
        producer,
        consumer,
        cursorEdge,
        cursorEdge.stamp,
      );

      if (__PROFILE__)
        observeRuntimeProjection?.(
          "projection.semantic.tracking.cursor.append",
        );
      devRecordTrackRead(defaultContext, consumer, producer);
      return;
    }
  }

  // Not in the tracked prefix: move the located suffix edge after the
  // cursor, to the head when the prefix is empty, or link a new edge there.
  // The located edge is not the first suffix edge, which the caller
  // compared, so a move is never a no-op. A configured strategy keeps its
  // contract (it is called for exactly these reads, after the prefix test)
  // and repeats its own search.
  const passStamp = cursorEdge === null ? trackingStamp : cursorEdge.stamp;

  devRecordTrackRead(defaultContext, consumer, producer);
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.tracking.slow-path");

  if (readTrackingStrategy !== DEFAULT_READ_TRACKING_STRATEGY) {
    consumer.tailIn = readTrackingStrategy(
      producer,
      consumer,
      cursorEdge,
      suffixStartEdge!,
      passStamp,
    );
    return;
  }

  if (locatedEdge === null) {
    if (__PROFILE__)
      observeRuntimeProjection?.(
        "projection.semantic.tracking.suffix.link-new",
      );
    consumer.tailIn = linkEdge(producer, consumer, cursorEdge, passStamp);
    return;
  }

  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.tracking.edge.move");
  if (cursorEdge === null) {
    moveTrackedIncomingEdgeToFrontUnchecked(consumer, locatedEdge, passStamp);
  } else {
    moveTrackedIncomingEdgeAfterCursorUnchecked(
      consumer,
      cursorEdge,
      locatedEdge,
    );
  }
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.tracking.suffix.reuse");
}

/**
 * Record a read of `producer` by the tracking consumer `consumer`.
 *
 * The pass stamp is derived, not supplied: a read extending the tracked
 * prefix uses the cursor edge's stamp (nested computation may have advanced
 * the epoch since), and the first read of a pass uses the current epoch.
 *
 * Stable dependency traces stay entirely in this small function. Dynamic
 * append/reorder/duplicate reconciliation is isolated in one handler that is
 * never inlined (resolveTrackedReadMiss), so V8 can inline the dominant
 * sequential path into every reader independently of which misses are hot.
 *
 * JIT: a miss handler receives only what it cannot derive with one load
 * (the stamp and the expected next edge are read again from the cursor);
 * every argument here costs bytecode that each inlining caller is charged.
 */
export function resolveTrackedRead(
  producer: ReactiveNode,
  consumer: ReactiveNode,
): void {
  {
    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.tracking.resolve");
  }

  const cursorEdge = consumer.tailIn;

  if (cursorEdge !== null) {
    const expectedNextEdge = cursorEdge.nextIn;

    // Stable traces overwhelmingly advance to the next existing edge.
    if (expectedNextEdge !== null && expectedNextEdge.from === producer) {
      expectedNextEdge.stamp = cursorEdge.stamp;
      consumer.tailIn = expectedNextEdge;
      {
        if (__PROFILE__)
          observeRuntimeProjection?.("projection.semantic.tracking.next.hit");
        devRecordTrackRead(defaultContext, consumer, producer);
      }
      return;
    }

    // Consecutive duplicate reads remain represented by the current cursor,
    // which already carries this pass's stamp.
    if (cursorEdge.from === producer) {
      {
        if (__PROFILE__)
          observeRuntimeProjection?.("projection.semantic.tracking.cursor.hit");
        devRecordTrackRead(defaultContext, consumer, producer);
      }
      return;
    }

    /* @__NOINLINE__ */ resolveTrackedReadMiss(producer, consumer, cursorEdge);
    return;
  }

  const firstIncomingEdge = consumer.firstIn;

  if (firstIncomingEdge === null) {
    linkFirstTrackedEdgeUnchecked(producer, consumer, trackingStamp);

    {
      if (__PROFILE__)
        observeRuntimeProjection?.(
          "projection.semantic.tracking.initial.create",
        );
      devRecordTrackRead(defaultContext, consumer, producer);
    }
    return;
  }

  if (firstIncomingEdge.from === producer) {
    firstIncomingEdge.stamp = trackingStamp;
    consumer.tailIn = firstIncomingEdge;
    {
      if (__PROFILE__)
        observeRuntimeProjection?.(
          "projection.semantic.tracking.initial.first-hit",
        );
      devRecordTrackRead(defaultContext, consumer, producer);
    }
    return;
  }

  /* @__NOINLINE__ */ resolveTrackedReadMiss(producer, consumer, null);
}
