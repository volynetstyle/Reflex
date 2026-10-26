import {
  DEFAULT_READ_TRACKING_STRATEGY,
  defaultContext,
  readTrackingStrategy,
} from "@runtime/kernel/config";
import { trackingStamp } from "@runtime/kernel/state";
import { devRecordTrackRead } from "@runtime/kernel/dev";
import {
  moveLastIncomingEdgeAfterCursorUnchecked,
  moveLastIncomingEdgeToFrontUnchecked,
  moveTrackedIncomingEdgeAfterCursorUnchecked,
} from "@runtime/kernel/shape/graph/edgeList";
import {
  appendTrackedEdgeAfterCursorUnchecked,
  linkFirstTrackedEdgeUnchecked,
} from "@runtime/kernel/shape/graph/linkEdge";
import { reuseLocatedIncomingEdgeOrLink } from "@runtime/kernel/shape/graph/reuseEdge";
import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { observeRuntimeProjection } from "@runtime/kernel/projection";

import { locateReorderedEdge, locateTrackedEdge } from "./locate";
import { isEdgeInTrackedPrefix } from "./prefix";

/**
 * Commit a read that is not in the tracked prefix and that no locality tier
 * resolved: reuse the located edge from the suffix or link a new one.
 *
 * `edge` is the exact lookup result. A configured strategy keeps its contract
 * (it is called for exactly these reads, after the prefix test) and repeats
 * its own search; the default strategy is applied to `edge` directly.
 */
function reconcileTrackedRead(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  cursorEdge: ReactiveEdge | null,
  suffixStartEdge: ReactiveEdge,
  passStamp: number,
  edge: ReactiveEdge | null,
): void {
  devRecordTrackRead(defaultContext, consumer, producer);
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.tracking.slow-path");

  consumer.tailIn =
    readTrackingStrategy === DEFAULT_READ_TRACKING_STRATEGY
      ? reuseLocatedIncomingEdgeOrLink(
          producer,
          consumer,
          cursorEdge,
          suffixStartEdge,
          passStamp,
          edge,
        )
      : readTrackingStrategy(
          producer,
          consumer,
          cursorEdge,
          suffixStartEdge,
          passStamp,
        );
}

/**
 * Cold initial-order miss. The common empty-list and first-edge hits stay in
 * resolveTrackedRead so its generated hot path remains small.
 */
function resolveInitialTrackedReadMiss(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  firstIncomingEdge: ReactiveEdge,
  passStamp: number,
): void {
  if (__TRACKING_LAST_EDGE__) {
    const lastIncomingEdge = consumer.lastIn!;

    if (lastIncomingEdge.from === producer) {
      if (__PROFILE__)
        observeRuntimeProjection?.(
          "projection.semantic.tracking.initial.last-edge-shortcut",
        );
      moveLastIncomingEdgeToFrontUnchecked(consumer, lastIncomingEdge);

      lastIncomingEdge.stamp = passStamp;
      consumer.tailIn = lastIncomingEdge;

      devRecordTrackRead(defaultContext, consumer, producer);
      return;
    }
  }

  // The prefix is empty: whatever the lookup finds is in the suffix. The
  // first incoming edge was compared by the caller.
  reconcileTrackedRead(
    producer,
    consumer,
    null,
    firstIncomingEdge,
    passStamp,
    locateTrackedEdge(producer, consumer, null, firstIncomingEdge.nextIn),
  );
}

/**
 * Cursor miss at the physical tail (`cursorEdge.nextIn === null`): append
 * locality and the completed-prefix guard.
 *
 * The suffix is empty, so every edge of the pair is in the prefix (INV-T2):
 * the read is a duplicate exactly when the edge exists, and stamps are not
 * consulted.
 *
 * JIT: kept apart from resolveCursorTrackedReadMiss. TurboFan charges a
 * caller for a callee's bytecode plus everything already inlined into the
 * callee's optimized code, against a 920-byte budget per compilation. As one
 * 300-byte function, both miss kinds were inlined into resolveTrackedRead
 * wherever either was hot, and resolveTrackedRead then no longer fit into
 * runWatcherCore, advanceCore or executeComputation. Split, a call site pulls
 * in only the miss kind that actually occurs there.
 */
function resolveTailTrackedReadMiss(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  cursorEdge: ReactiveEdge,
  passStamp: number,
): void {
  // With the cursor at lastIn, any edge of the pair is in the tracked prefix
  // (INV-T2): the read is a duplicate exactly when the edge exists. The
  // cursor itself was compared by the caller.
  if (locateTrackedEdge(producer, consumer, cursorEdge.prevIn, null) !== null) {
    if (__PROFILE__)
      observeRuntimeProjection?.(
        "projection.semantic.tracking.prefix.duplicate",
      );
    devRecordTrackRead(defaultContext, consumer, producer);
    return;
  }

  appendTrackedEdgeAfterCursorUnchecked(
    producer,
    consumer,
    cursorEdge,
    passStamp,
  );

  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.tracking.cursor.append");
  devRecordTrackRead(defaultContext, consumer, producer);
}

/**
 * Cursor miss inside the list: bounded reorder and tail locality, then one
 * exact lookup that both detects a duplicate and finds a reusable edge.
 */
function resolveCursorTrackedReadMiss(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  cursorEdge: ReactiveEdge,
  expectedNextEdge: ReactiveEdge,
  passStamp: number,
): void {
  const lookahead1Edge = expectedNextEdge.nextIn;

  if (lookahead1Edge !== null) {
    if (__TRACKING_ONE_HOP__ && lookahead1Edge.from === producer) {
      if (__PROFILE__)
        observeRuntimeProjection?.(
          "projection.semantic.tracking.reorder.one-hop",
        );
      devRecordTrackRead(defaultContext, consumer, producer);

      moveTrackedIncomingEdgeAfterCursorUnchecked(
        consumer,
        cursorEdge,
        lookahead1Edge,
        passStamp,
      );
      return;
    }

    if (__TRACKING_TWO_HOP__) {
      const lookahead2Edge = lookahead1Edge.nextIn;

      if (lookahead2Edge !== null && lookahead2Edge.from === producer) {
        if (__PROFILE__)
          observeRuntimeProjection?.(
            "projection.semantic.tracking.reorder.two-hop",
          );
        devRecordTrackRead(defaultContext, consumer, producer);

        moveTrackedIncomingEdgeAfterCursorUnchecked(
          consumer,
          cursorEdge,
          lookahead2Edge,
          passStamp,
        );
        return;
      }
    }
  }

  if (__TRACKING_LAST_EDGE__) {
    const lastIncomingEdge = consumer.lastIn!;

    if (lastIncomingEdge.from === producer) {
      const previousLastEdge = lastIncomingEdge.prevIn!;

      if (previousLastEdge !== cursorEdge) {
        if (__PROFILE__)
          observeRuntimeProjection?.(
            "projection.semantic.tracking.last-edge.shortcut",
          );
        moveLastIncomingEdgeAfterCursorUnchecked(
          consumer,
          cursorEdge,
          expectedNextEdge,
          lastIncomingEdge,
          previousLastEdge,
          passStamp,
        );

        devRecordTrackRead(defaultContext, consumer, producer);
        return;
      }
    }
  }

  // Exact lookup. The cursor and the expected next edge were compared by
  // the caller, so the incoming side starts beside them.
  const edge = locateReorderedEdge(
    producer,
    consumer,
    cursorEdge.prevIn,
    lookahead1Edge,
  );

  // JIT: boolean call result; see resolveTailTrackedReadMiss.
  if (
    edge !== null &&
    isEdgeInTrackedPrefix(consumer, cursorEdge, edge) === true
  ) {
    if (__PROFILE__)
      observeRuntimeProjection?.(
        "projection.semantic.tracking.prefix.duplicate",
      );
    devRecordTrackRead(defaultContext, consumer, producer);
    return;
  }

  reconcileTrackedRead(
    producer,
    consumer,
    cursorEdge,
    expectedNextEdge,
    passStamp,
    edge,
  );
}

/**
 * Record a read of `producer` by the tracking consumer `consumer`.
 *
 * The pass stamp is derived here, not supplied: a read extending the tracked
 * prefix uses the cursor edge's stamp (nested computation may have advanced
 * the epoch since), and the first read of a pass uses the current epoch.
 *
 * Stable dependency traces stay entirely in this small function. Dynamic
 * append/reorder/duplicate reconciliation is isolated in cold helpers so V8
 * can optimize and inline the dominant sequential path independently.
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
    const passStamp = cursorEdge.stamp;
    const expectedNextEdge = cursorEdge.nextIn;

    // Stable traces overwhelmingly advance to the next existing edge.
    if (expectedNextEdge !== null && expectedNextEdge.from === producer) {
      expectedNextEdge.stamp = passStamp;
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

    if (expectedNextEdge === null) {
      /* @__NOINLINE__ */ resolveTailTrackedReadMiss(
        producer,
        consumer,
        cursorEdge,
        passStamp,
      );
      return;
    }

    /* @__NOINLINE__ */ resolveCursorTrackedReadMiss(
      producer,
      consumer,
      cursorEdge,
      expectedNextEdge,
      passStamp,
    );
    return;
  }

  const passStamp = trackingStamp;
  const firstIncomingEdge = consumer.firstIn;

  if (firstIncomingEdge === null) {
    linkFirstTrackedEdgeUnchecked(producer, consumer, passStamp);

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
    firstIncomingEdge.stamp = passStamp;
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

  /* @__NOINLINE__ */ resolveInitialTrackedReadMiss(
    producer,
    consumer,
    firstIncomingEdge,
    passStamp,
  );
}
