import {
  createChainCase,
  createChurnCase,
  createDependencyWidthCase,
  createFaninCase,
  createFanoutCase,
  createLocalityCase,
  createSemanticRatioCase,
  type BenchCase,
  type LocalityMode,
} from "../../tools/fixtures/topology-generators";

/**
 * Sweep configuration shared verbatim by the structural run (counters, under
 * vite.dev.config.ts / __PROFILE__: true) and the timing run (wall-clock,
 * under vite.config.ts / __PROFILE__: false). Both runners import this file
 * and must build the *same* case for the same `key`, so structural and
 * timing records can be joined by `key` in analysis.
 */
export type SweepConfig = {
  key: string;
  sweep: string;
  axis: string;
  axisValue: number | string;
  secondaryAxis?: string;
  secondaryValue?: number | string;
  iterations: number;
  build(): {
    case: BenchCase;
    getObservedRatio?(): number;
    resetObservedRatio?(): void;
  };
};

// Baseline holds every axis at a "typical" mid-range value while one axis is
// swept at a time (one-factor-at-a-time / OFAT).
const BASELINE = {
  depth: 16,
  fanout: 64,
  fanin: 64,
  width: 128,
  churnRate: 0.1,
  semanticRatio: 0.5,
  locality: "stable" as LocalityMode,
};

function iterationsFor(size: number): number {
  if (size >= 1024) return 30;
  if (size >= 256) return 80;
  return 300;
}

const DEPTH_GRID = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512];
const FANOUT_GRID = [1, 4, 16, 64, 192, 512, 1024, 2048];
const FANIN_GRID = [1, 4, 16, 64, 192, 512, 1024, 2048];
const WIDTH_GRID = [8, 32, 128, 512, 2048];
const CHURN_GRID = [0, 0.01, 0.1, 0.5, 1];
const SEMANTIC_GRID = [0, 0.25, 0.5, 0.75, 1];
const LOCALITY_GRID: LocalityMode[] = [
  "stable",
  "permutation",
  "distant-reuse",
  "duplicate-reads",
];

function depthSweep(): SweepConfig[] {
  return DEPTH_GRID.map((depth) => ({
    key: `depth.${depth}`,
    sweep: "depth",
    axis: "depth",
    axisValue: depth,
    iterations: iterationsFor(depth),
    build: () => ({ case: createChainCase(depth) }),
  }));
}

function fanoutSweep(): SweepConfig[] {
  return FANOUT_GRID.map((fanout) => ({
    key: `fanout.${fanout}`,
    sweep: "fanout",
    axis: "fanout",
    axisValue: fanout,
    iterations: iterationsFor(fanout),
    build: () => ({ case: createFanoutCase(fanout) }),
  }));
}

function faninSweep(): SweepConfig[] {
  return FANIN_GRID.map((fanin) => ({
    key: `fanin.${fanin}`,
    sweep: "fanin",
    axis: "fanin",
    axisValue: fanin,
    iterations: iterationsFor(fanin),
    build: () => ({ case: createFaninCase(fanin) }),
  }));
}

function widthSweep(): SweepConfig[] {
  return WIDTH_GRID.map((width) => ({
    key: `width.${width}`,
    sweep: "width",
    axis: "width",
    axisValue: width,
    iterations: iterationsFor(width),
    build: () => ({ case: createDependencyWidthCase(width) }),
  }));
}

function churnSweep(): SweepConfig[] {
  return CHURN_GRID.map((churnRate) => ({
    key: `churn.${churnRate}`,
    sweep: "churn",
    axis: "churnRate",
    axisValue: churnRate,
    iterations: iterationsFor(BASELINE.width),
    build: () => ({ case: createChurnCase(BASELINE.width, churnRate) }),
  }));
}

function semanticSweep(): SweepConfig[] {
  return SEMANTIC_GRID.map((ratio) => ({
    key: `semantic.${ratio}`,
    sweep: "semantic",
    axis: "semanticRatio",
    axisValue: ratio,
    iterations: iterationsFor(BASELINE.width),
    build: () => createSemanticRatioCase(BASELINE.width, ratio),
  }));
}

function localitySweep(): SweepConfig[] {
  return LOCALITY_GRID.map((mode) => ({
    key: `locality.${mode}`,
    sweep: "locality",
    axis: "locality",
    axisValue: mode,
    iterations: iterationsFor(BASELINE.width),
    build: () => ({ case: createLocalityCase(BASELINE.width, mode) }),
  }));
}

// Two targeted 2-way interaction sweeps, chosen because the source research
// spec explicitly asked whether reconciliation dominance shifts earlier at
// high dependency width as churn grows, and whether producer-side search vs.
// pull-verification dominance depends on fanout at a fixed semantic ratio.
function churnByWidthSweep(): SweepConfig[] {
  const widths = [32, 128, 512];
  const configs: SweepConfig[] = [];

  for (const width of widths) {
    for (const churnRate of CHURN_GRID) {
      configs.push({
        key: `churnByWidth.w${width}.c${churnRate}`,
        sweep: "churnByWidth",
        axis: "churnRate",
        axisValue: churnRate,
        secondaryAxis: "width",
        secondaryValue: width,
        iterations: iterationsFor(width),
        build: () => ({ case: createChurnCase(width, churnRate) }),
      });
    }
  }

  return configs;
}

function fanoutBySemanticSweep(): SweepConfig[] {
  const fanouts = [16, 192, 1024];
  const configs: SweepConfig[] = [];

  for (const fanout of fanouts) {
    for (const ratio of SEMANTIC_GRID) {
      configs.push({
        key: `fanoutBySemantic.f${fanout}.s${ratio}`,
        sweep: "fanoutBySemantic",
        axis: "semanticRatio",
        axisValue: ratio,
        secondaryAxis: "fanout",
        secondaryValue: fanout,
        iterations: iterationsFor(fanout),
        // Reuses the semantic-ratio generator's width parameter as the
        // fanned-out child count so the interaction is over the same two
        // axes named in the sweep id.
        build: () => createSemanticRatioCase(fanout, ratio),
      });
    }
  }

  return configs;
}

// --- Stack-capacity threshold investigation ------------------------------
//
// src/kernel/stages/second/pull_iterator.ts forcibly truncates its explicit
// walker stack back to STACK_TRIM_MIN_CAPACITY (256) after every top-level
// call whose usage exceeded it. src/kernel/stages/first/push_iterator.ts
// does the analogous thing to its own `propagateStack` at
// MAX_RETAINED_PROPAGATE_STACK (512). Both are separate arrays, separate
// thresholds, on separate sides of the runtime (pull vs. push). These two
// dense sweeps test whether a chain-depth cliff lands at 256 (pull) and a
// wide-fanout cliff lands at 512 (push) — i.e. whether "512" is a single
// universal threshold, or two same-shaped-but-distinct mechanisms.
const DEPTH_NEAR_PULL_THRESHOLD = [
  192, 224, 240, 248, 252, 254, 255, 256, 257, 258, 260, 264, 272, 288, 320,
  384, 448, 512,
];
const FANOUT_NEAR_PUSH_THRESHOLD = [
  384, 448, 480, 496, 504, 508, 510, 511, 512, 513, 514, 516, 520, 528, 544,
  576, 640, 768, 1024,
];

function depthNearPullThresholdSweep(): SweepConfig[] {
  return DEPTH_NEAR_PULL_THRESHOLD.map((depth) => ({
    key: `depthPullThreshold.${depth}`,
    sweep: "depthPullThreshold",
    axis: "depth",
    axisValue: depth,
    iterations: iterationsFor(depth),
    build: () => ({ case: createChainCase(depth) }),
  }));
}

function fanoutNearPushThresholdSweep(): SweepConfig[] {
  return FANOUT_NEAR_PUSH_THRESHOLD.map((fanout) => ({
    key: `fanoutPushThreshold.${fanout}`,
    sweep: "fanoutPushThreshold",
    axis: "fanout",
    axisValue: fanout,
    iterations: iterationsFor(fanout),
    build: () => ({ case: createFanoutCase(fanout) }),
  }));
}

// fanout is fixed at 1024 — already past MAX_RETAINED_PROPAGATE_STACK (512)
// at every grid point, so the push-side trim/regrow cost should be constant
// across ratio. If ns/op still swings non-monotonically with ratio despite a
// constant trim-event rate, the capacity mechanism does not explain that
// swing and it needs a different explanation. Iterations are bumped well
// above what iterationsFor(1024) would give (30) specifically to cut noise
// on this reproduction attempt.
const SEMANTIC_FIXED_FANOUT = 1024;
const SEMANTIC_FIXED_FANOUT_GRID = [0, 0.25, 0.5, 0.75, 1];
const SEMANTIC_FIXED_FANOUT_ITERATIONS = 150;

function semanticFixedFanoutSweep(): SweepConfig[] {
  return SEMANTIC_FIXED_FANOUT_GRID.map((ratio) => ({
    key: `semanticFixedFanout1024.${ratio}`,
    sweep: "semanticFixedFanout1024",
    axis: "semanticRatio",
    axisValue: ratio,
    iterations: SEMANTIC_FIXED_FANOUT_ITERATIONS,
    build: () => createSemanticRatioCase(SEMANTIC_FIXED_FANOUT, ratio),
  }));
}

// The 252->254 jump in depthNearPullThresholdSweep happens BEFORE the
// empirical trim-onset (260) and coincides with iterationsFor()'s own
// breakpoint (300 iterations below depth 256, 80 at/above it) — a confound in
// the sweep itself, not necessarily a runtime phenomenon. This re-measures
// every integer depth in [244,262] at a single FIXED iteration count so
// iteration-count is no longer a variable, to see whether the jump is real
// and where it actually sits relative to depth=256.
const DEPTH_FINE_CLIFF = Array.from({ length: 19 }, (_, i) => 244 + i);
const DEPTH_FINE_CLIFF_ITERATIONS = 200;

function depthFineCliffSweep(): SweepConfig[] {
  return DEPTH_FINE_CLIFF.map((depth) => ({
    key: `depthFineCliff.${depth}`,
    sweep: "depthFineCliff",
    axis: "depth",
    axisValue: depth,
    iterations: DEPTH_FINE_CLIFF_ITERATIONS,
    build: () => ({ case: createChainCase(depth) }),
  }));
}

export function allSweepConfigs(): SweepConfig[] {
  return [
    ...depthSweep(),
    ...fanoutSweep(),
    ...faninSweep(),
    ...widthSweep(),
    ...churnSweep(),
    ...semanticSweep(),
    ...localitySweep(),
    ...churnByWidthSweep(),
    ...fanoutBySemanticSweep(),
    ...depthNearPullThresholdSweep(),
    ...fanoutNearPushThresholdSweep(),
    ...semanticFixedFanoutSweep(),
    ...depthFineCliffSweep(),
  ];
}

export const WARMUP_ITERATIONS = 50;
