import {
  createChurnRealDeltaCase,
  createChurnZeroDeltaCase,
  createDepthControlCase,
  createFanoutSelectivityCase,
  createLocalityAmplificationCase,
  createSemanticRatioStaggeredCase,
  createWidthAmplificationCase,
  type AmplificationCase,
  type LocalityMode,
} from "../../tools/fixtures/amplification-generators";

export type AmplificationConfig = {
  key: string;
  sweep: string;
  axis: string;
  axisValue: number | string;
  iterations: number;
  build(): { case: AmplificationCase; expectedDeltaPerWrite?: number };
};

const BASELINE_WIDTH = 128;

function iterationsFor(size: number): number {
  if (size >= 1024) return 40;
  if (size >= 256) return 100;
  return 200;
}

// fanout fixed large; readFraction shrinks from "read everything" to "read
// almost nothing" — push invalidation cost is read-oblivious (touches all
// direct subscribers regardless of future read intent), so this is the
// axis most likely to show the runtime doing O(fanout) work for a shrinking
// O(fanout * readFraction) semantic payload.
const FANOUT_SELECTIVITY_FANOUT = 512;
const READ_FRACTION_GRID = [1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01, 1 / FANOUT_SELECTIVITY_FANOUT];

function fanoutSelectivitySweep(): AmplificationConfig[] {
  return READ_FRACTION_GRID.map((readFraction) => ({
    key: `fanoutSelectivity.${readFraction}`,
    sweep: "fanoutSelectivity",
    axis: "readFraction",
    axisValue: readFraction,
    iterations: iterationsFor(FANOUT_SELECTIVITY_FANOUT),
    build: () => ({
      case: createFanoutSelectivityCase(FANOUT_SELECTIVITY_FANOUT, readFraction),
    }),
  }));
}

// Complementary probe: fanout grows but exactly ONE sink is ever read
// (readFraction = 1/fanout every time), isolating "does absolute waste per
// unit of fixed semantic delta grow with fanout" from the ratio-based framing
// above.
const FANOUT_SINGLE_SINK_GRID = [1, 4, 16, 64, 192, 512, 1024, 2048];

function fanoutSingleSinkSweep(): AmplificationConfig[] {
  return FANOUT_SINGLE_SINK_GRID.map((fanout) => ({
    key: `fanoutSingleSink.${fanout}`,
    sweep: "fanoutSingleSink",
    axis: "fanout",
    axisValue: fanout,
    iterations: iterationsFor(fanout),
    build: () => ({ case: createFanoutSelectivityCase(fanout, 1 / fanout) }),
  }));
}

const DEPTH_GRID = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512];

function depthControlSweep(): AmplificationConfig[] {
  return DEPTH_GRID.map((depth) => ({
    key: `depthControl.${depth}`,
    sweep: "depthControl",
    axis: "depth",
    axisValue: depth,
    iterations: iterationsFor(depth),
    build: () => ({ case: createDepthControlCase(depth) }),
  }));
}

const WIDTH_GRID = [8, 32, 128, 512, 2048];

function widthSweep(): AmplificationConfig[] {
  return WIDTH_GRID.map((width) => ({
    key: `width.${width}`,
    sweep: "width",
    axis: "width",
    axisValue: width,
    iterations: iterationsFor(width),
    build: () => ({ case: createWidthAmplificationCase(width) }),
  }));
}

const CHURN_GRID = [0, 0.01, 0.1, 0.5, 1];

function churnRealDeltaSweep(): AmplificationConfig[] {
  return CHURN_GRID.map((churnRate) => ({
    key: `churnRealDelta.${churnRate}`,
    sweep: "churnRealDelta",
    axis: "churnRate",
    axisValue: churnRate,
    iterations: iterationsFor(BASELINE_WIDTH),
    build: () => ({
      case: createChurnRealDeltaCase(BASELINE_WIDTH, churnRate),
    }),
  }));
}

function churnZeroDeltaSweep(): AmplificationConfig[] {
  return CHURN_GRID.map((churnRate) => ({
    key: `churnZeroDelta.${churnRate}`,
    sweep: "churnZeroDelta",
    axis: "churnRate",
    axisValue: churnRate,
    iterations: iterationsFor(BASELINE_WIDTH),
    build: () => ({
      case: createChurnZeroDeltaCase(BASELINE_WIDTH, churnRate),
    }),
  }));
}

const LOCALITY_GRID: LocalityMode[] = [
  "stable",
  "permutation",
  "distant-reuse",
  "duplicate-reads",
];

function localitySweep(): AmplificationConfig[] {
  return LOCALITY_GRID.map((mode) => ({
    key: `locality.${mode}`,
    sweep: "locality",
    axis: "locality",
    axisValue: mode,
    iterations: iterationsFor(BASELINE_WIDTH),
    build: () => ({
      case: createLocalityAmplificationCase(BASELINE_WIDTH, mode),
    }),
  }));
}

const SEMANTIC_GRID = [0, 0.25, 0.5, 0.75, 1];

function semanticStaggeredSweep(): AmplificationConfig[] {
  return SEMANTIC_GRID.map((ratio) => ({
    key: `semanticStaggered.${ratio}`,
    sweep: "semanticStaggered",
    axis: "semanticRatio",
    axisValue: ratio,
    iterations: iterationsFor(BASELINE_WIDTH),
    build: () => {
      const { amplification, expectedDeltaPerWrite } =
        createSemanticRatioStaggeredCase(BASELINE_WIDTH, ratio);
      return { case: amplification, expectedDeltaPerWrite };
    },
  }));
}

export function allAmplificationConfigs(): AmplificationConfig[] {
  return [
    ...fanoutSelectivitySweep(),
    ...fanoutSingleSinkSweep(),
    ...depthControlSweep(),
    ...widthSweep(),
    ...churnRealDeltaSweep(),
    ...churnZeroDeltaSweep(),
    ...localitySweep(),
    ...semanticStaggeredSweep(),
  ];
}

export const WARMUP_ITERATIONS = 30;
