import type { ReactiveNode } from "../shape";
import { readIncomingSources, sameSources } from "./sourceOrder";
import type {
  GraphReductionMode,
  GraphReductionState,
  MutableGraphReductionState,
  NormalizedGraphReductionOptions,
} from "./types";

const graphReductionPolicyStates = new WeakMap<
  ReactiveNode,
  MutableGraphReductionState
>();

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
  enabled: boolean = options.enabled,
): void {
  if (!enabled) return;

  const sources = readIncomingSources(node);
  let state = graphReductionPolicyStates.get(node);

  if (state === undefined) {
    state = {
      mode: resolveMode(1, options),
      stableRuns: 1,
      dependencyCount: sources.length,
      s: 0,
      deoptCount: 0,
      mismatchCount: 0,
      cooldownRuns: 0,
      sources,
    };
    graphReductionPolicyStates.set(node, state);
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
    state.s += 1;
    state.sources = sources;
  }

  state.dependencyCount = sources.length;
  state.mode =
    state.cooldownRuns > 0 ? "dynamic" : resolveMode(state.stableRuns, options);
}

export function getGraphReductionState(
  node: ReactiveNode,
): GraphReductionState | undefined {
  const state = graphReductionPolicyStates.get(node);

  if (state === undefined) return undefined;

  return {
    mode: state.mode,
    stableRuns: state.stableRuns,
    dependencyCount: state.dependencyCount,
    s: state.s,
    deoptCount: state.deoptCount,
    mismatchCount: state.mismatchCount,
    cooldownRuns: state.cooldownRuns,
  };
}

export function clearGraphReductionState(node: ReactiveNode): void {
  graphReductionPolicyStates.delete(node);
}
