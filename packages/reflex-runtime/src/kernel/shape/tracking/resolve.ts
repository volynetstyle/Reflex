import { defaultContext, readTrackingStrategy } from "@runtime/kernel/config";
import { trackingEpoch } from "@runtime/kernel/state";
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
import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { observeRuntimeProjection } from "@runtime/kernel/projection";

import {
  hasProducerInCompletedPrefix,
  hasProducerInTrackedPrefix,
} from "./prefix";

/** Cold fallback shared by cursor and initial misses. */
function resolveTrackedReadSlow(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  cursorEdge: ReactiveEdge | null,
  nextExpectedEdge: ReactiveEdge | null,
  producerVersion: number,
): void {
  devRecordTrackRead(defaultContext, consumer, producer);
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.tracking.slow-path");

  consumer.tailIn = readTrackingStrategy(
    producer,
    consumer,
    cursorEdge,
    nextExpectedEdge,
    producerVersion,
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
  producerVersion: number,
): void {
  if (__TRACKING_LAST_EDGE__) {
    const lastIncomingEdge = consumer.lastIn!;

    if (lastIncomingEdge.from === producer) {
      if (__PROFILE__)
        observeRuntimeProjection?.(
          "projection.semantic.tracking.initial.last-edge-shortcut",
        );
      moveLastIncomingEdgeToFrontUnchecked(consumer, lastIncomingEdge);

      lastIncomingEdge.version = producerVersion;
      consumer.tailIn = lastIncomingEdge;

      devRecordTrackRead(defaultContext, consumer, producer);
      return;
    }
  }

  resolveTrackedReadSlow(
    producer,
    consumer,
    null,
    firstIncomingEdge,
    producerVersion,
  );
}

/** Cursor miss handling: append, bounded reorder, duplicate, then slow path. */
function resolveCursorTrackedReadMiss(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  cursorEdge: ReactiveEdge,
  expectedNextEdge: ReactiveEdge | null,
  producerVersion: number,
): void {
  if (expectedNextEdge === null) {
    const firstProducerEdge = producer.firstOut;

    // No outgoing edge, or one edge to another consumer, proves this is a new
    // dependency without walking the tracked prefix.
    if (
      firstProducerEdge === null ||
      (firstProducerEdge.nextOut === null && firstProducerEdge.to !== consumer)
    ) {
      appendTrackedEdgeAfterCursorUnchecked(
        producer,
        consumer,
        cursorEdge,
        producerVersion,
      );

      if (__PROFILE__)
        observeRuntimeProjection?.(
          "projection.semantic.tracking.cursor.append",
        );
      devRecordTrackRead(defaultContext, consumer, producer);
      return;
    }

    // With the cursor at lastIn, a sole edge to this consumer is necessarily
    // already in the tracked prefix.
    if (firstProducerEdge.nextOut === null) {
      if (__PROFILE__)
        observeRuntimeProjection?.(
          "projection.semantic.tracking.prefix.duplicate",
        );
      devRecordTrackRead(defaultContext, consumer, producer);
      return;
    }

    if (
      hasProducerInCompletedPrefix(
        producer,
        consumer,
        cursorEdge,
        producerVersion,
      )
    ) {
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
      producerVersion,
    );

    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.tracking.cursor.append");
    devRecordTrackRead(defaultContext, consumer, producer);
    return;
  }

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
        producerVersion,
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
          producerVersion,
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
          producerVersion,
        );

        devRecordTrackRead(defaultContext, consumer, producer);
        return;
      }
    }
  }

  if (
    hasProducerInTrackedPrefix(producer, consumer, cursorEdge, producerVersion)
  ) {
    if (__PROFILE__)
      observeRuntimeProjection?.(
        "projection.semantic.tracking.prefix.duplicate",
      );
    devRecordTrackRead(defaultContext, consumer, producer);
    return;
  }

  resolveTrackedReadSlow(
    producer,
    consumer,
    cursorEdge,
    expectedNextEdge,
    producerVersion,
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
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.tracking.resolve");

  const cursorEdge = consumer.tailIn;

  if (cursorEdge !== null) {
    const producerVersion = cursorEdge.version;
    const expectedNextEdge = cursorEdge.nextIn;

    // Stable traces overwhelmingly advance to the next existing edge.
    if (expectedNextEdge !== null && expectedNextEdge.from === producer) {
      expectedNextEdge.version = producerVersion;
      consumer.tailIn = expectedNextEdge;

      if (__PROFILE__)
        observeRuntimeProjection?.("projection.semantic.tracking.next.hit");
      devRecordTrackRead(defaultContext, consumer, producer);
      return;
    }

    // Consecutive duplicate reads remain represented by the current cursor,
    // which already carries this pass's stamp.
    if (cursorEdge.from === producer) {
      if (__PROFILE__)
        observeRuntimeProjection?.("projection.semantic.tracking.cursor.hit");
      devRecordTrackRead(defaultContext, consumer, producer);
      return;
    }

    /* @__NOINLINE__ */ resolveCursorTrackedReadMiss(
      producer,
      consumer,
      cursorEdge,
      expectedNextEdge,
      producerVersion,
    );
    return;
  }

  const producerVersion = trackingEpoch;
  const firstIncomingEdge = consumer.firstIn;

  if (firstIncomingEdge === null) {
    linkFirstTrackedEdgeUnchecked(producer, consumer, producerVersion);

    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.tracking.initial.create");
    devRecordTrackRead(defaultContext, consumer, producer);
    return;
  }

  if (firstIncomingEdge.from === producer) {
    firstIncomingEdge.version = producerVersion;
    consumer.tailIn = firstIncomingEdge;

    if (__PROFILE__)
      observeRuntimeProjection?.(
        "projection.semantic.tracking.initial.first-hit",
      );
    devRecordTrackRead(defaultContext, consumer, producer);
    return;
  }

  /* @__NOINLINE__ */ resolveInitialTrackedReadMiss(
    producer,
    consumer,
    firstIncomingEdge,
    producerVersion,
  );
}
