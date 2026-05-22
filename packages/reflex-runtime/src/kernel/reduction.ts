import type { ReactiveNode } from "./shape";

export type GraphReductionMode =
  | "dynamic"
  | "stabilized"
  | "specialized"
  | "static-transition-plan";

export interface GraphReductionOptions {
  enabled?: boolean;
  stableThreshold?: number;
  specializeThreshold?: number;
  staticPlanThreshold?: number;
  stabilizeAfter?: number;
  deoptAfterMismatch?: number;
  cooldownAfterDeopt?: number;
}

export interface NormalizedGraphReductionOptions {
  enabled: boolean;
  stableThreshold: number;
  specializeThreshold: number;
  staticPlanThreshold: number;
  deoptAfterMismatch: number;
  cooldownAfterDeopt: number;
}

export interface GraphReductionState {
  readonly mode: GraphReductionMode;
  readonly stableRuns: number;
  readonly dependencyCount: number;
  readonly topologyVersion: number;
  readonly deoptCount: number;
  readonly mismatchCount: number;
  readonly cooldownRuns: number;
}

interface MutableGraphReductionState {
  mode: GraphReductionMode;
  stableRuns: number;
  dependencyCount: number;
  topologyVersion: number;
  deoptCount: number;
  mismatchCount: number;
  cooldownRuns: number;
  sources: ReactiveNode[];
}

export const DEFAULT_GRAPH_REDUCTION_OPTIONS: NormalizedGraphReductionOptions =
  {
    enabled: false,
    stableThreshold: 3,
    specializeThreshold: 6,
    staticPlanThreshold: 12,
    deoptAfterMismatch: 1,
    cooldownAfterDeopt: 16,
  };

const graphReductionStates = new WeakMap<
  ReactiveNode,
  MutableGraphReductionState
>();

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

export function normalizeGraphReductionOptions(
  options: GraphReductionOptions | boolean | undefined,
  fallback: NormalizedGraphReductionOptions = DEFAULT_GRAPH_REDUCTION_OPTIONS,
): NormalizedGraphReductionOptions {
  if (options === true) {
    return { ...fallback, enabled: true };
  }

  if (options === false || options === undefined) {
    return {
      ...fallback,
      enabled: options === false ? false : fallback.enabled,
    };
  }

  const stableThreshold = normalizePositiveInteger(
    options.stabilizeAfter ?? options.stableThreshold,
    fallback.stableThreshold,
  );
  const specializeThreshold = Math.max(
    stableThreshold,
    normalizePositiveInteger(
      options.specializeThreshold,
      fallback.specializeThreshold,
    ),
  );
  const staticPlanThreshold = Math.max(
    specializeThreshold,
    normalizePositiveInteger(
      options.staticPlanThreshold,
      fallback.staticPlanThreshold,
    ),
  );

  return {
    enabled: options.enabled ?? fallback.enabled,
    stableThreshold,
    specializeThreshold,
    staticPlanThreshold,
    deoptAfterMismatch: normalizePositiveInteger(
      options.deoptAfterMismatch,
      fallback.deoptAfterMismatch,
    ),
    cooldownAfterDeopt: normalizePositiveInteger(
      options.cooldownAfterDeopt,
      fallback.cooldownAfterDeopt,
    ),
  };
}

function readIncomingSources(node: ReactiveNode): ReactiveNode[] {
  const sources: ReactiveNode[] = [];

  for (let edge = node.firstIn; edge !== null; edge = edge.nextIn) {
    sources.push(edge.from);
  }

  return sources;
}

function sameSources(left: ReactiveNode[], right: ReactiveNode[]): boolean {
  if (left.length !== right.length) return false;

  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }

  return true;
}

function resolveMode(
  stableRuns: number,
  options: NormalizedGraphReductionOptions,
): GraphReductionMode {
  if (stableRuns >= options.staticPlanThreshold) {
    return "static-transition-plan";
  }

  if (stableRuns >= options.specializeThreshold) {
    return "specialized";
  }

  if (stableRuns >= options.stableThreshold) {
    return "stabilized";
  }

  return "dynamic";
}

export function observeGraphReductionRun(
  node: ReactiveNode,
  options: NormalizedGraphReductionOptions,
): void {
  if (!options.enabled) return;

  const sources = readIncomingSources(node);
  let state = graphReductionStates.get(node);

  if (state === undefined) {
    state = {
      mode: resolveMode(1, options),
      stableRuns: 1,
      dependencyCount: sources.length,
      topologyVersion: 0,
      deoptCount: 0,
      mismatchCount: 0,
      cooldownRuns: 0,
      sources,
    };
    graphReductionStates.set(node, state);
    return;
  }

  if (sameSources(state.sources, sources)) {
    state.stableRuns += 1;
    state.mismatchCount = 0;
    if (state.cooldownRuns > 0) {
      state.cooldownRuns -= 1;
    }
  } else {
    state.mismatchCount += 1;
    if (
      state.mode !== "dynamic" &&
      state.mismatchCount >= options.deoptAfterMismatch
    ) {
      state.deoptCount += 1;
      state.cooldownRuns = options.cooldownAfterDeopt;
    }
    state.mode = "dynamic";
    state.stableRuns = 0;
    state.topologyVersion += 1;
    state.sources = sources;
  }

  state.dependencyCount = sources.length;
  state.mode =
    state.cooldownRuns > 0 ? "dynamic" : resolveMode(state.stableRuns, options);
}

export function getGraphReductionState(
  node: ReactiveNode,
): GraphReductionState | undefined {
  const state = graphReductionStates.get(node);

  if (state === undefined) return undefined;

  return {
    mode: state.mode,
    stableRuns: state.stableRuns,
    dependencyCount: state.dependencyCount,
    topologyVersion: state.topologyVersion,
    deoptCount: state.deoptCount,
    mismatchCount: state.mismatchCount,
    cooldownRuns: state.cooldownRuns,
  };
}

export function clearGraphReductionState(node: ReactiveNode): void {
  graphReductionStates.delete(node);
}
