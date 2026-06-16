import { bench, describe } from "vitest";
import { performance } from "node:perf_hooks";
import { memo as memoProd, signal as signalProd } from "../dist/esm/index.js";
import {
  createConsumer,
  createProducer,
  DEFAULT_READ_TRACKING_STRATEGY,
  readConsumerEager,
  readConsumerLazy,
  readProducer,
  setRuntimeContextOptions,
  writeProducer,
  type ReactiveEdge,
  type ReactiveNode,
} from "../../reflex-runtime/dist/dev/internal.js";
import { profileRuntime } from "../../reflex-runtime/dist/dev/debug.js";

const DEPS = 1_024;
const STEPS = 512;

type SignalCell = {
  get(): number;
  set(value: number): void;
};

type Scenario = {
  id: string;
  label: string;
  patterns: number[][];
};

const scenarios: Scenario[] = [
  {
    id: "static_1024",
    label: "Static 1024",
    patterns: [range(DEPS)],
  },
  {
    id: "rotate_1024",
    label: "Rotate 1024",
    patterns: rotatePatterns(DEPS),
  },
  {
    id: "alt_ab_1024",
    label: "Alt A/B 1024",
    patterns: [range(DEPS), range(DEPS).reverse()],
  },
  {
    id: "swap_small_1024",
    label: "Swap Small 1024",
    patterns: Array.from({ length: DEPS }, (_, step) => {
      const pattern = range(DEPS);
      const first = (step * 17) % DEPS;
      const second = (first + 1 + (step % 7)) % DEPS;
      [pattern[first], pattern[second]] = [pattern[second]!, pattern[first]!];

      return pattern;
    }),
  },
  {
    id: "prefix_suffix_chaotic_1024",
    label: "Prefix/Suffix Chaotic 1024",
    patterns: prefixSuffixChaoticPatterns(DEPS),
  },
  {
    id: "mixed_1024",
    label: "Mixed 1024",
    patterns: Array.from({ length: DEPS }, (_, step) => {
      const phaseLength = 8;
      const phase = Math.floor(step / phaseLength);

      return Array.from(
        { length: DEPS },
        (__, index) => (index + phase * 13) % DEPS,
      );
    }),
  },
  {
    id: "branch_half_1024",
    label: "Branch Half 1024",
    patterns: branchHalfPatterns(DEPS),
  },
  {
    id: "stable_then_drop_1024",
    label: "Stable Then Drop 1024",
    patterns: stableThenDropPatterns(DEPS),
  },
  {
    id: "oscillate_rotate_branch_1024",
    label: "Oscillate Rotate/Branch 1024",
    patterns: oscillateRotateBranchPatterns(DEPS),
  },
  {
    id: "oscillate_rotate_swap_1024",
    label: "Oscillate Rotate/Swap 1024",
    patterns: oscillateRotateSwapPatterns(DEPS),
  },
  {
    id: "branch_swap_1024",
    label: "Branch Swap 1024",
    patterns: [
      Array.from({ length: DEPS }, (_, index) => index),
      Array.from({ length: DEPS }, (_, index) => index + DEPS),
    ],
  },
  {
    id: "mixed_churn_1024",
    label: "Mixed Churn 1024",
    patterns: Array.from({ length: DEPS }, (_, step) => {
      const retained = Math.floor(DEPS * 0.7);
      const churned = DEPS - retained;
      const stable = Array.from(
        { length: retained },
        (__, index) => (index + step) % retained,
      );
      const moving = Array.from(
        { length: churned },
        (__, index) => retained + ((step * churned + index) % DEPS),
      );

      return interleave(stable, moving, step);
    }),
  },
];

describe("dependency churn", () => {
  for (const scenario of scenarios) {
    bench(
      scenario.label,
      () => {
        measureScenario(scenario.patterns);
      },
      {
        iterations: 30,
        warmupIterations: 10,
      },
    );
  }
});

function measureScenario(patterns: number[][]): number {
  return measureScenarioWithRuntime(patterns, memoProd, signalProd);
}

function measureScenarioWithDevRuntime(patterns: number[][]): number {
  return measureScenarioWithRuntime(patterns, memoProfile, signalProfile);
}

function measureScenarioWithRuntime(
  patterns: number[][],
  memoFn: typeof memoProd,
  signalFn: typeof signalProd,
): number {
  const selector = createSignalCell(0, signalFn);
  const sources = Array.from({ length: getSourceCount(patterns) }, (_, index) =>
    createSignalCell(index, signalFn),
  );
  const total = memoFn(() => sumPattern(patterns[selector.get()]!, sources));
  let sink = 0;
  const start = performance.now();

  for (let step = 0; step < STEPS; step += 1) {
    selector.set(step % patterns.length);
    sink += total();
  }

  const elapsedMs = performance.now() - start;

  if (!Number.isFinite(sink)) {
    throw new Error("Benchmark produced a non-finite sink value.");
  }

  return elapsedMs;
}

function sumPattern(pattern: number[], sources: SignalCell[]): number {
  let total = 0;

  for (const sourceIndex of pattern) {
    total += sources[sourceIndex]!.get();
  }

  return total;
}

function getSourceCount(patterns: number[][]): number {
  let maxSourceIndex = DEPS * 2 - 1;

  for (const pattern of patterns) {
    for (const sourceIndex of pattern) {
      if (sourceIndex > maxSourceIndex) maxSourceIndex = sourceIndex;
    }
  }

  return maxSourceIndex + 1;
}

type TrackingRouteCounterName =
  | "trackingCursorHit"
  | "trackingNextHit"
  | "trackingAppendAfterCursor"
  | "trackingPrefixDuplicate"
  | "trackingOneHopReorder"
  | "trackingTwoHopReorder"
  | "trackingLastEdgeShortcut"
  | "trackingInitialCreate"
  | "trackingInitialFirstHit"
  | "trackingInitialLastEdgeShortcut"
  | "trackingSlowPath"
  | "trackingSlowPathBlocked";

type RuntimeProfileCounters = Record<TrackingRouteCounterName, number> & {
  trackingResolveCalls: number;
};

type ReadTrackingStrategy = (
  source: ReactiveNode,
  consumer: ReactiveNode,
  prev: ReactiveEdge | null,
  nextExpected: ReactiveEdge | null,
  version: number,
) => ReactiveEdge;

interface SlowPathScanStats {
  calls: number;
  total: number;
  max: number;
  samples: number[];
  found: number;
  notFound: number;
  distance33To63: number;
  distance64To127: number;
  distance128To255: number;
  distance256Plus: number;
}

const trackingRouteCounters: readonly TrackingRouteCounterName[] = [
  "trackingCursorHit",
  "trackingNextHit",
  "trackingAppendAfterCursor",
  "trackingPrefixDuplicate",
  "trackingOneHopReorder",
  "trackingTwoHopReorder",
  "trackingLastEdgeShortcut",
  "trackingInitialCreate",
  "trackingInitialFirstHit",
  "trackingInitialLastEdgeShortcut",
  "trackingSlowPath",
  "trackingSlowPathBlocked",
];

function logDependencyChurnTrackingProfiles(): void {
  console.log("\n[bench:reflex] dependency churn tracking route profiles");

  console.table(
    scenarios.map((scenario) => {
      const slowPathScanStats = createSlowPathScanStats();
      const { counters } = profileRuntime(() =>
        withSlowPathScanProfiling(slowPathScanStats, () =>
          measureScenarioWithDevRuntime(scenario.patterns),
        ),
      );

      return formatTrackingRouteProfile(scenario, counters, slowPathScanStats);
    }),
  );
}

function formatTrackingRouteProfile(
  scenario: Scenario,
  counters: RuntimeProfileCounters,
  slowPathScanStats: SlowPathScanStats,
): Record<string, string | number> {
  const total = counters.trackingResolveCalls;
  const row: Record<string, string | number> = {
    scenario: scenario.id,
    reads: total,
  };

  for (const route of trackingRouteCounters) {
    const hits = counters[route];

    if (hits !== 0) {
      row[route] = `${hits} (${((hits / total) * 100).toFixed(2)}%)`;
    }
  }

  if (slowPathScanStats.calls !== 0) {
    row.slowPathAvgScan = formatEdges(
      slowPathScanStats.total / slowPathScanStats.calls,
    );
    row.slowPathP95Scan = percentile(slowPathScanStats.samples, 0.95);
    row.slowPathP99Scan = percentile(slowPathScanStats.samples, 0.99);
    row.slowPathMaxScan = slowPathScanStats.max;
    row.slowPathFound = formatCountPct(
      slowPathScanStats.found,
      slowPathScanStats.calls,
    );
    row.slowPathNotFound = formatCountPct(
      slowPathScanStats.notFound,
      slowPathScanStats.calls,
    );
    row.slowPathDistance33To63 = formatCountPct(
      slowPathScanStats.distance33To63,
      slowPathScanStats.calls,
    );
    row.slowPathDistance64To127 = formatCountPct(
      slowPathScanStats.distance64To127,
      slowPathScanStats.calls,
    );
    row.slowPathDistance128To255 = formatCountPct(
      slowPathScanStats.distance128To255,
      slowPathScanStats.calls,
    );
    row.slowPathDistance256Plus = formatCountPct(
      slowPathScanStats.distance256Plus,
      slowPathScanStats.calls,
    );
  }

  return row;
}

function createSlowPathScanStats(): SlowPathScanStats {
  return {
    calls: 0,
    total: 0,
    max: 0,
    samples: [],
    found: 0,
    notFound: 0,
    distance33To63: 0,
    distance64To127: 0,
    distance128To255: 0,
    distance256Plus: 0,
  };
}

function withSlowPathScanProfiling<T>(
  stats: SlowPathScanStats,
  fn: () => T,
): T {
  setRuntimeContextOptions({
    readTrackingStrategy: createSlowPathScanStrategy(stats),
  });

  try {
    return fn();
  } finally {
    setRuntimeContextOptions({
      readTrackingStrategy: DEFAULT_READ_TRACKING_STRATEGY,
    });
  }
}

function createSlowPathScanStrategy(
  stats: SlowPathScanStats,
): ReadTrackingStrategy {
  return (producer, consumer, insertAfterEdge, suffixStartEdge, version) => {
    recordSlowPathScanLength(
      stats,
      producer,
      consumer,
      suffixStartEdge,
      version,
    );

    return DEFAULT_READ_TRACKING_STRATEGY(
      producer,
      consumer,
      insertAfterEdge,
      suffixStartEdge,
      version,
    );
  };
}

function recordSlowPathScanLength(
  stats: SlowPathScanStats,
  producer: ReactiveNode,
  consumer: ReactiveNode,
  suffixStartEdge: ReactiveEdge | null,
  producerVersion: number,
): void {
  const scanLength = measureSlowPathScanLength(
    producer,
    consumer,
    suffixStartEdge,
    producerVersion,
  );
  const postCutoffDistance = measurePostCutoffProducerDistance(
    producer,
    consumer,
    suffixStartEdge,
  );

  stats.calls += 1;
  stats.total += scanLength;
  if (scanLength > stats.max) stats.max = scanLength;
  stats.samples.push(scanLength);

  if (postCutoffDistance === null) {
    stats.notFound += 1;
  } else {
    stats.found += 1;

    if (postCutoffDistance < 64) {
      stats.distance33To63 += 1;
    } else if (postCutoffDistance < 128) {
      stats.distance64To127 += 1;
    } else if (postCutoffDistance < 256) {
      stats.distance128To255 += 1;
    } else {
      stats.distance256Plus += 1;
    }
  }
}

function measureSlowPathScanLength(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  suffixStartEdge: ReactiveEdge | null,
  producerVersion: number,
): number {
  if (suffixStartEdge?.from === producer) return 1;

  let scannedSuffixEdges = suffixStartEdge === null ? 0 : 1;

  for (
    let candidateEdge = suffixStartEdge?.nextIn ?? consumer.firstIn;
    candidateEdge !== null;
    candidateEdge = candidateEdge.nextIn
  ) {
    scannedSuffixEdges += 1;

    if (candidateEdge.from === producer) break;

    if (
      suffixStartEdge !== null &&
      producerVersion !== 0 &&
      scannedSuffixEdges === 32
    ) {
      const producerEdge = findOutgoingEdgeToConsumer(producer, consumer);

      if (producerEdge === null || producerEdge.version !== producerVersion) {
        break;
      }
    }
  }

  return scannedSuffixEdges;
}

function measurePostCutoffProducerDistance(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  suffixStartEdge: ReactiveEdge | null,
): number | null {
  let distance = suffixStartEdge === null ? 0 : 1;

  for (
    let candidateEdge = suffixStartEdge?.nextIn ?? consumer.firstIn;
    candidateEdge !== null;
    candidateEdge = candidateEdge.nextIn
  ) {
    distance += 1;

    if (distance <= 32) continue;
    if (candidateEdge.from === producer) return distance;
  }

  return null;
}

function findOutgoingEdgeToConsumer(
  producer: ReactiveNode,
  consumer: ReactiveNode,
): ReactiveEdge | null {
  for (let edge = producer.firstOut; edge !== null; edge = edge.nextOut) {
    if (edge.to === consumer) return edge;
  }

  return null;
}

function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;

  samples.sort((left, right) => left - right);

  return samples[Math.ceil(samples.length * p) - 1]!;
}

function formatEdges(value: number): string {
  return `${value.toFixed(1)} edges`;
}

function formatCountPct(count: number, total: number): string {
  return `${count} (${((count / total) * 100).toFixed(2)}%)`;
}

function signalProfile(
  initial: number,
): readonly [() => number, (value: number) => void] {
  const node = createProducer(initial);

  return [
    () => readProducer(node),
    (value: number) => {
      writeProducer(node, value);
    },
  ] as const;
}

function memoProfile(fn: () => number): () => number {
  const node = createConsumer(fn);

  readConsumerEager(node);

  return readConsumerLazy.bind(node) as () => number;
}

logDependencyChurnTrackingProfiles();

function createSignalCell(
  initial: number,
  signalFn: typeof signalProd = signalProd,
): SignalCell {
  const value = signalFn(initial);

  if (Array.isArray(value)) {
    const [get, set] = value;
    return { get, set };
  }

  return {
    get: value,
    set(next) {
      value(next);
    },
  };
}

function interleave(left: number[], right: number[], offset: number): number[] {
  const output: number[] = [];
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    if ((index + offset) % 3 === 0) {
      if (right[index] !== undefined) output.push(right[index]);
      if (left[index] !== undefined) output.push(left[index]);
    } else {
      if (left[index] !== undefined) output.push(left[index]);
      if (right[index] !== undefined) output.push(right[index]);
    }
  }

  return output;
}

function range(length: number, start = 0): number[] {
  return Array.from({ length }, (_, index) => start + index);
}

function rotatePatterns(deps: number): number[][] {
  return Array.from({ length: deps }, (_, step) =>
    Array.from({ length: deps }, (__, index) => (index + step) % deps),
  );
}

function prefixSuffixChaoticPatterns(deps: number): number[][] {
  return Array.from({ length: deps }, (_, step) => {
    const pivot = 1 + ((step * 37) % (deps - 1));
    const prefix = range(pivot).reverse();
    const suffix = range(deps - pivot, pivot);

    return step % 2 === 0
      ? interleave(prefix, suffix, step)
      : interleave(suffix.reverse(), prefix, step);
  });
}

function branchHalfPatterns(deps: number): number[][] {
  const half = Math.floor(deps / 2);

  return [
    [...range(half), ...range(deps - half, deps)],
    [...range(half), ...range(deps - half, deps + half)],
  ];
}

function stableThenDropPatterns(deps: number): number[][] {
  const stable = range(deps);
  const retained = Math.floor(deps * 0.7);
  const dropped = deps - retained;
  const partial = [
    ...range(retained),
    ...Array.from({ length: dropped }, (_, index) => index % retained),
  ];

  return Array.from({ length: deps }, (_, step) =>
    step < Math.floor(deps * 0.75) ? stable : partial,
  );
}

function oscillateRotateBranchPatterns(deps: number): number[][] {
  const half = Math.floor(deps / 2);

  return Array.from({ length: deps }, (_, step) => {
    if (step % 2 === 0) {
      return Array.from({ length: deps }, (__, index) => (index + step) % deps);
    }

    return [
      ...range(half),
      ...range(deps - half, deps + ((step % 4) + 1) * half),
    ];
  });
}

function oscillateRotateSwapPatterns(deps: number): number[][] {
  return Array.from({ length: deps }, (_, step) => {
    if (step % 2 === 0) {
      return Array.from({ length: deps }, (__, index) => (index + step) % deps);
    }

    const pattern = range(deps);

    for (let swap = 0; swap < 4; swap += 1) {
      const first = (step * 19 + swap * 23) % deps;
      const second = (first + 1 + swap) % deps;
      [pattern[first], pattern[second]] = [pattern[second]!, pattern[first]!];
    }

    return pattern;
  });
}
