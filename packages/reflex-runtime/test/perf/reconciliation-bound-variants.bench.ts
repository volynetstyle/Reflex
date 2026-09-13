/**
 * Isolated perf tests for candidates B and C1 from the reflex-runtime
 * structural-compression pass (see plans/reflex-runtime-delegated-pascal.md).
 *
 * Both candidates are exercised by calling the reconciliation function
 * directly with hand-built edge lists, bypassing `resolveTrackedRead`'s
 * upper fast tiers (NextHit/CursorHit/one-hop/two-hop/last-edge/prefix-scan)
 * entirely. This isolates the single mechanism under test: `reuseEdge.ts`'s
 * R1 eager-abandonment fallback, which is otherwise reached only when every
 * cheaper tier has already missed.
 *
 * No source file in `src/` is modified. Candidate B (bounded
 * `findOutgoingEdgeToConsumer`) and the C1 half of candidate C (bounded
 * `EAGER_STALE_SUFFIX_CLEANUP_MIN`) are re-implemented here as bench-local
 * copies of `reuseIncomingEdgeFromSuffixOrLink`, built only from primitives
 * `reflex-runtime` already exports (`linkEdge`, the `move*Unchecked` movers,
 * `unlinkDetachedIncomingEdgeSequence`). The baseline is the real, imported
 * `reuseIncomingEdgeFromSuffixOrLink` — not a re-implementation — so the
 * comparison is against actual shipped behavior.
 */
import { beforeAll, bench, describe } from "vitest";

import {
  Consumer,
  moveIncomingEdgeAfterUnchecked,
  moveLastIncomingEdgeAfterEdgeUnchecked,
  moveLastIncomingEdgeToFrontUnchecked,
  moveMiddleIncomingEdgeAfterEdgeUnchecked,
  moveNonHeadIncomingEdgeToFrontUnchecked,
  linkEdge,
  Producer,
  ReactiveNode,
  reuseIncomingEdgeFromSuffixOrLink,
  unlinkDetachedIncomingEdgeSequence,
  type ReactiveEdge,
} from "../../src/kernel";

// #region Shared bench-local reconciliation copy (mirrors reuseEdge.ts)
//
// These are line-for-line structural copies of the private helpers in
// kernel/shape/graph/reuseEdge.ts, built only from exported primitives.
// The only behavioral difference from the shipped implementation is the
// parameterized bound/threshold each candidate varies.

function moveIncomingEdgeToPosition(
  consumer: ReactiveNode,
  edge: ReactiveEdge,
  insertAfterEdge: ReactiveEdge | null,
): void {
  if (edge.prevIn === insertAfterEdge) return;

  if (insertAfterEdge === null) {
    if (edge.nextIn === null) {
      moveLastIncomingEdgeToFrontUnchecked(consumer, edge);
    } else {
      moveNonHeadIncomingEdgeToFrontUnchecked(consumer, edge);
    }
  } else if (edge.prevIn === null) {
    moveIncomingEdgeAfterUnchecked(consumer, edge, insertAfterEdge);
  } else if (edge.nextIn === null) {
    moveLastIncomingEdgeAfterEdgeUnchecked(consumer, edge, insertAfterEdge);
  } else {
    moveMiddleIncomingEdgeAfterEdgeUnchecked(consumer, edge, insertAfterEdge);
  }
}

function findOutgoingEdgeToConsumerBounded(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  maxProbe: number,
): { edge: ReactiveEdge | null; probed: number } {
  let probed = 0;

  for (
    let edge = producer.firstOut;
    edge !== null && probed < maxProbe;
    edge = edge.nextOut
  ) {
    probed += 1;
    if (edge.to === consumer) return { edge, probed };
  }

  return { edge: null, probed };
}

function detachIncomingSuffix(
  consumer: ReactiveNode,
  insertAfterEdge: ReactiveEdge | null,
  suffixStartEdge: ReactiveEdge,
): void {
  if (insertAfterEdge === null) {
    consumer.firstIn = null;
    consumer.lastIn = null;
  } else {
    insertAfterEdge.nextIn = null;
    consumer.lastIn = insertAfterEdge;
  }

  suffixStartEdge.prevIn = null;
  unlinkDetachedIncomingEdgeSequence(suffixStartEdge);
}

type ReuseStats = {
  outgoingProbes: number;
  outgoingProbeLength: number;
  edgesCreated: number;
  edgesReused: number;
};

/** Candidate B: bounded `findOutgoingEdgeToConsumer` probe. */
function reuseWithBoundedOutgoingProbe(
  maxProbe: number,
  staleSuffixCleanupMin: number,
  stats: ReuseStats,
) {
  return function reuseBounded(
    producer: ReactiveNode,
    consumer: ReactiveNode,
    insertAfterEdge: ReactiveEdge | null,
    suffixStartEdge: ReactiveEdge | null,
    producerVersion = 0,
  ): ReactiveEdge {
    // R0: suffix head hit.
    if (suffixStartEdge !== null && suffixStartEdge.from === producer) {
      suffixStartEdge.version = producerVersion;
      stats.edgesReused += 1;
      return suffixStartEdge;
    }

    // R0.5: first outgoing edge hit.
    if (producerVersion !== 0) {
      const edge = producer.firstOut;

      if (edge !== null && edge.to === consumer && edge.version !== producerVersion) {
        if (edge.prevIn !== insertAfterEdge) {
          moveIncomingEdgeToPosition(consumer, edge, insertAfterEdge);
        }

        edge.version = producerVersion;
        stats.edgesReused += 1;
        return edge;
      }
    }

    // R1: suffix scan with bounded eager-abandonment probe.
    let scannedSuffixEdges = suffixStartEdge === null ? 0 : 1;

    for (
      let candidateEdge =
        suffixStartEdge === null ? consumer.firstIn : suffixStartEdge.nextIn;
      candidateEdge !== null;
      candidateEdge = candidateEdge.nextIn
    ) {
      scannedSuffixEdges += 1;

      if (candidateEdge.from !== producer) {
        if (
          suffixStartEdge !== null &&
          producerVersion !== 0 &&
          scannedSuffixEdges === staleSuffixCleanupMin
        ) {
          stats.outgoingProbes += 1;

          const { edge: producerEdge, probed } = findOutgoingEdgeToConsumerBounded(
            producer,
            consumer,
            maxProbe,
          );

          stats.outgoingProbeLength += probed;

          if (producerEdge === null) {
            detachIncomingSuffix(consumer, insertAfterEdge, suffixStartEdge);
            stats.edgesCreated += 1;
            return linkEdge(producer, consumer, insertAfterEdge, producerVersion);
          }

          if (producerEdge.version !== producerVersion) {
            if (producerEdge.prevIn !== insertAfterEdge) {
              moveIncomingEdgeToPosition(consumer, producerEdge, insertAfterEdge);
            }

            producerEdge.version = producerVersion;
            stats.edgesReused += 1;
            return producerEdge;
          }
        }

        continue;
      }

      if (candidateEdge.prevIn !== insertAfterEdge) {
        moveIncomingEdgeToPosition(consumer, candidateEdge, insertAfterEdge);
      }

      candidateEdge.version = producerVersion;
      stats.edgesReused += 1;
      return candidateEdge;
    }

    // R2: suffix miss.
    if (
      suffixStartEdge !== null &&
      scannedSuffixEdges >= staleSuffixCleanupMin
    ) {
      detachIncomingSuffix(consumer, insertAfterEdge, suffixStartEdge);
    }

    stats.edgesCreated += 1;
    return linkEdge(producer, consumer, insertAfterEdge, producerVersion);
  };
}

// #endregion

function findOutgoingEdgeToConsumerUnbounded(
  producer: ReactiveNode,
  consumer: ReactiveNode,
): { edge: ReactiveEdge | null; probed: number } {
  let probed = 0;

  for (let edge = producer.firstOut; edge !== null; edge = edge.nextOut) {
    probed += 1;
    if (edge.to === consumer) return { edge, probed };
  }

  return { edge: null, probed };
}

function createProducerNode(): ReactiveNode {
  return new ReactiveNode(undefined, undefined, Producer);
}

function createConsumerNode(): ReactiveNode {
  return new ReactiveNode(undefined, undefined, Consumer);
}

const WARMUP_ITERATIONS = 100;
const ITERATIONS = 2_000;

// #region Candidate B, primary measurement: static probe-only cost
//
// The integration-level scenarios further below (full
// reuseIncomingEdgeFromSuffixOrLink calls) rebuild a large producer fanout
// list on every iteration to keep each call's graph state fresh. That
// rebuild cost (500+ object allocations) dwarfs the probe cost the
// hypothesis is actually about, which swamps the signal in wall-clock
// terms. This section isolates the probe itself: the producer's fanout
// list is built ONCE (read-only from then on), and each iteration only
// calls the probe function against it - no allocation, no mutation, no
// setup cost inside the timed step. This is the primary evidence for
// candidate B's O(fanout) vs O(bound) claim.

const STATIC_FANOUT = 512;
const STATIC_TARGET_POSITION = 400; // consumer's edge sits deep in the list
const STATIC_ABSENT_TARGET_POSITION = 400; // same depth, but never placed - probe always misses

function buildStaticFanout(placeTarget: boolean): {
  producer: ReactiveNode;
  target: ReactiveNode;
} {
  const producer = createProducerNode();
  const target = createConsumerNode();

  for (let index = 0; index < STATIC_FANOUT; index += 1) {
    if (placeTarget && index === STATIC_TARGET_POSITION) {
      linkEdge(producer, target, null, 1);
      continue;
    }

    linkEdge(producer, createConsumerNode(), null, 1);
  }

  return { producer, target };
}

function runStaticProbe(scenarioLabel: string, placeTarget: boolean): void {
  const { producer, target } = buildStaticFanout(placeTarget);

  describe(`reconciliation | candidate B (static probe) - ${scenarioLabel}`, () => {
    beforeAll(() => {
      console.log(
        `[candidate B/static/${scenarioLabel}] fanout=${STATIC_FANOUT}, ` +
          `target=${placeTarget ? `present @${STATIC_TARGET_POSITION}` : `absent (probed to @${STATIC_ABSENT_TARGET_POSITION})`}, ` +
          `read-only - no per-iteration allocation`,
      );
    });

    bench(
      "baseline: unbounded probe",
      () => {
        findOutgoingEdgeToConsumerUnbounded(producer, target);
      },
      { warmupIterations: WARMUP_ITERATIONS, iterations: ITERATIONS },
    );

    bench(
      "candidate: bounded probe (probe=8)",
      () => {
        findOutgoingEdgeToConsumerBounded(producer, target, 8);
      },
      { warmupIterations: WARMUP_ITERATIONS, iterations: ITERATIONS },
    );
  });
}

runStaticProbe("target present deep in list", true);
runStaticProbe("target absent (full scan miss)", false);

// #endregion

// #region Candidate B, secondary measurement: full reconciliation call
//
// Reproduces the exact shape from the plan's safety proof (§B). Two
// distinct scenarios, because bounding the probe has two different cost
// profiles depending on whether the true edge exists:
//
// B1 - no existing edge anywhere (genuine new dependency): both baseline
//      and candidate end up creating a new edge either way; the only
//      difference is how many outgoing-list entries get probed before
//      reaching that same conclusion. Pure probe-miss cost, no semantic
//      difference.
// B2 - the true edge DOES exist, deep in the producer's fanout, beyond the
//      candidate's probe bound: baseline reuses it (O(fanout) probe, zero
//      allocation); candidate's bounded probe misses, falls to
//      detach+create (O(bound) probe, one allocation, one detach walk).
//      This is the exact reuse-vs-recreate tradeoff the safety proof
//      establishes as semantics-preserving but not cost-free.
//
// Each iteration builds a fresh graph shape (so baseline and candidate pay
// identical setup cost) and calls the reconciliation function exactly once.
// Caveat: at this fanout the ~550-object setup dominates total per-iteration
// time, so wall-clock deltas here are noisier than the static-probe section
// above - treat the counters (outgoingProbeLength) as the reliable signal
// for this section, and the static-probe benchmarks as the reliable signal
// for wall-clock cost.

const FANOUT_B = 512;
const TRUE_EDGE_FANOUT_POSITION_B = 400; // deep in producer's outgoing list
const SUFFIX_LENGTH_B = 40; // > EAGER_STALE_SUFFIX_CLEANUP_MIN (32)

function buildScenarioB(placeTrueEdge: boolean): {
  producer: ReactiveNode;
  consumer: ReactiveNode;
  insertAfterEdge: ReactiveEdge | null;
  suffixStartEdge: ReactiveEdge | null;
} {
  const producer = createProducerNode();
  const consumer = createConsumerNode();

  for (let index = 0; index < FANOUT_B; index += 1) {
    if (placeTrueEdge && index === TRUE_EDGE_FANOUT_POSITION_B) {
      linkEdge(producer, consumer, consumer.lastIn, 1);
      continue;
    }

    linkEdge(producer, createConsumerNode(), null, 1);
  }

  // Build the consumer's stale incoming suffix: SUFFIX_LENGTH_B edges from
  // distinct producers, none of which is `producer` - the true edge (when
  // placed) already sits in `consumer.firstIn..lastIn` from the loop above,
  // past this freshly-appended suffix, so it is not found by R1's own scan
  // before the eager probe fires.
  let suffixStartEdge: ReactiveEdge | null = null;

  for (let index = 0; index < SUFFIX_LENGTH_B; index += 1) {
    const edge = linkEdge(createProducerNode(), consumer, consumer.lastIn, 1);
    if (suffixStartEdge === null) suffixStartEdge = edge;
  }

  return { producer, consumer, insertAfterEdge: null, suffixStartEdge };
}

function runB(scenarioLabel: string, placeTrueEdge: boolean): void {
  describe(`reconciliation | candidate B - ${scenarioLabel}`, () => {
    const statsBounded: ReuseStats = {
      outgoingProbes: 0,
      outgoingProbeLength: 0,
      edgesCreated: 0,
      edgesReused: 0,
    };

    beforeAll(() => {
      console.log(
        `[candidate B/${scenarioLabel}] fanout=${FANOUT_B}, suffix=${SUFFIX_LENGTH_B}, ` +
          `trueEdge=${placeTrueEdge ? `present @${TRUE_EDGE_FANOUT_POSITION_B}` : "absent"}`,
      );
    });

    bench(
      "baseline: unbounded findOutgoingEdgeToConsumer",
      () => {
        const { producer, consumer, insertAfterEdge, suffixStartEdge } =
          buildScenarioB(placeTrueEdge);

        reuseIncomingEdgeFromSuffixOrLink(
          producer,
          consumer,
          insertAfterEdge,
          suffixStartEdge,
          7,
        );
      },
      { warmupIterations: WARMUP_ITERATIONS, iterations: ITERATIONS },
    );

    bench(
      "candidate: bounded findOutgoingEdgeToConsumer (probe=8)",
      () => {
        const { producer, consumer, insertAfterEdge, suffixStartEdge } =
          buildScenarioB(placeTrueEdge);
        const reuse = reuseWithBoundedOutgoingProbe(8, 32, statsBounded);

        reuse(producer, consumer, insertAfterEdge, suffixStartEdge, 7);
      },
      {
        warmupIterations: WARMUP_ITERATIONS,
        iterations: ITERATIONS,
        teardown() {
          console.log(
            `[candidate B/${scenarioLabel}] bounded(8) stats:`,
            JSON.stringify(statsBounded),
          );
        },
      },
    );
  });
}

runB("B1 no existing edge (pure probe-miss cost)", false);
runB("B2 existing deep edge (reuse-vs-recreate tradeoff)", true);

// #endregion

// #region Candidate C1: EAGER_STALE_SUFFIX_CLEANUP_MIN calibration
//
// Same reconciliation call, but the true producer edge is genuinely present
// in the consumer's suffix at a fixed depth (TRUE_EDGE_DEPTH_C1). Varying
// the cleanup threshold changes whether the R1 loop's own linear scan finds
// it before the eager-abandonment heuristic fires, or after. This isolates
// the threshold's effect on total edges scanned per resolved read.

const TRUE_EDGE_DEPTH_C1 = 48; // position of the real dependency in the suffix
const SUFFIX_LENGTH_C1 = 80;

function buildScenarioC1(): {
  producer: ReactiveNode;
  consumer: ReactiveNode;
  insertAfterEdge: ReactiveEdge | null;
  suffixStartEdge: ReactiveEdge | null;
} {
  const producer = createProducerNode();
  const consumer = createConsumerNode();
  let suffixStartEdge: ReactiveEdge | null = null;

  for (let index = 0; index < SUFFIX_LENGTH_C1; index += 1) {
    const from = index === TRUE_EDGE_DEPTH_C1 ? producer : createProducerNode();
    const edge = linkEdge(from, consumer, consumer.lastIn, 1);
    if (suffixStartEdge === null) suffixStartEdge = edge;
  }

  // Give the producer a modest fanout so R0.5 (first-outgoing-edge shortcut)
  // does not trivially resolve this before R1 is exercised.
  linkEdge(producer, createConsumerNode(), null, 1);

  return { producer, consumer, insertAfterEdge: null, suffixStartEdge };
}

const thresholds = [16, 32, 64, 128];

describe("reconciliation | candidate C1 - EAGER_STALE_SUFFIX_CLEANUP_MIN calibration", () => {
  beforeAll(() => {
    console.log(
      `[candidate C1] true edge depth=${TRUE_EDGE_DEPTH_C1}, suffix=${SUFFIX_LENGTH_C1}, ` +
        `thresholds=${thresholds.join(",")}`,
    );
  });

  for (const threshold of thresholds) {
    const stats: ReuseStats = {
      outgoingProbes: 0,
      outgoingProbeLength: 0,
      edgesCreated: 0,
      edgesReused: 0,
    };

    bench(
      `threshold=${threshold}`,
      () => {
        const { producer, consumer, insertAfterEdge, suffixStartEdge } =
          buildScenarioC1();
        const reuse = reuseWithBoundedOutgoingProbe(
          Number.POSITIVE_INFINITY,
          threshold,
          stats,
        );

        reuse(producer, consumer, insertAfterEdge, suffixStartEdge, 7);
      },
      {
        warmupIterations: WARMUP_ITERATIONS,
        iterations: ITERATIONS,
        teardown() {
          console.log(
            `[candidate C1] threshold=${threshold} stats:`,
            JSON.stringify(stats),
          );
        },
      },
    );
  }
});

// #endregion
