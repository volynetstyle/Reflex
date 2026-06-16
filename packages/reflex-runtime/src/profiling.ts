export interface RuntimeProfileCounters {
  writeCalls: number;
  writeSameValue: number;
  writeChanged: number;
  writeNoSubscribers: number;
  writeNestedPropagation: number;
  propagationScopesEntered: number;
  propagationScopesLeft: number;
  pushCalls: number;
  pushDirectEdgesVisited: number;
  pushTransitiveEdgesVisited: number;
  pushMarkedChanged: number;
  pushMarkedInvalid: number;
  pushAlreadyDirtySkipped: number;
  pushComputingChecked: number;
  pushWatchersInvalidated: number;
  pushChildBranchesQueued: number;
  pushOnceCalls: number;
  pushOnceEdgesVisited: number;
  pushOnceMarkedChanged: number;
  pushOnceAlreadyChangedSkipped: number;
  pushOnceSkippedEdges: number;
  pullCalls: number;
  pullEdgesVisited: number;
  pullChangedDeps: number;
  pullInvalidDeps: number;
  pullCleanDeps: number;
  pullDescents: number;
  pullAdvanceCalls: number;
  pullStableSiblingScans: number;
  pullChangedBubbles: number;
  advanceCalls: number;
  advanceComputeRuns: number;
  advanceChanged: number;
  advanceUnchanged: number;
  advanceCleanupChecks: number;
  advanceCleanupRuns: number;
  advancePropagateCalls: number;
  advancePropagateSkippedEdge: number;
  readProducerCalls: number;
  readProducerTracked: number;
  readConsumerCalls: number;
  readConsumerLazyCalls: number;
  readConsumerEagerCalls: number;
  readConsumerCleanFastPath: number;
  readConsumerDirtyPath: number;
  readConsumerTracked: number;
  stabilizeForceAdvance: number;
  stabilizePullAdvance: number;
  trackingResolveCalls: number;
  trackingCursorHit: number;
  trackingNextHit: number;
  trackingAppendAfterCursor: number;
  trackingPrefixDuplicate: number;
  trackingOneHopReorder: number;
  trackingTwoHopReorder: number;
  trackingLastEdgeShortcut: number;
  trackingInitialCreate: number;
  trackingInitialFirstHit: number;
  trackingInitialLastEdgeShortcut: number;
  trackingSlowPath: number;
  trackingSlowPathBlocked: number;
  cleanupCalls: number;
  cleanupSkipped: number;
  cleanupEdgesDropped: number;
  watcherRunCalls: number;
  watcherCleanSkips: number;
  watcherStableSkips: number;
  watcherDisposedSkips: number;
  watcherExecutions: number;
  watcherCleanups: number;
  watcherDisposals: number;
  contextRunCalls: number;
  contextSwitches: number;
  contextPropagationEnter: number;
  contextPropagationLeave: number;
  contextSettledChecks: number;
  contextSettledEmits: number;
  contextSettledDeferred: number;
  sinkInvalidatedEmits: number;
}

export type RuntimeProfileCounterName = keyof RuntimeProfileCounters;

export type RuntimeProfileResult<T> = {
  value: T;
  counters: RuntimeProfileCounters;
};

export interface RuntimeProfileSession {
  readonly baseline: RuntimeProfileCounters;
  read(): RuntimeProfileCounters;
  delta(from?: RuntimeProfileCounters): RuntimeProfileCounters;
  reset(): void;
  stop(): RuntimeProfileCounters;
}

type RuntimeProfileSessionOptions = {
  enabled?: boolean;
  reset?: boolean;
};

const COUNTER_NAMES = [
  "writeCalls",
  "writeSameValue",
  "writeChanged",
  "writeNoSubscribers",
  "writeNestedPropagation",
  "propagationScopesEntered",
  "propagationScopesLeft",
  "pushCalls",
  "pushDirectEdgesVisited",
  "pushTransitiveEdgesVisited",
  "pushMarkedChanged",
  "pushMarkedInvalid",
  "pushAlreadyDirtySkipped",
  "pushComputingChecked",
  "pushWatchersInvalidated",
  "pushChildBranchesQueued",
  "pushOnceCalls",
  "pushOnceEdgesVisited",
  "pushOnceMarkedChanged",
  "pushOnceAlreadyChangedSkipped",
  "pushOnceSkippedEdges",
  "pullCalls",
  "pullEdgesVisited",
  "pullChangedDeps",
  "pullInvalidDeps",
  "pullCleanDeps",
  "pullDescents",
  "pullAdvanceCalls",
  "pullStableSiblingScans",
  "pullChangedBubbles",
  "advanceCalls",
  "advanceComputeRuns",
  "advanceChanged",
  "advanceUnchanged",
  "advanceCleanupChecks",
  "advanceCleanupRuns",
  "advancePropagateCalls",
  "advancePropagateSkippedEdge",
  "readProducerCalls",
  "readProducerTracked",
  "readConsumerCalls",
  "readConsumerLazyCalls",
  "readConsumerEagerCalls",
  "readConsumerCleanFastPath",
  "readConsumerDirtyPath",
  "readConsumerTracked",
  "stabilizeForceAdvance",
  "stabilizePullAdvance",
  "trackingResolveCalls",
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
  "cleanupCalls",
  "cleanupSkipped",
  "cleanupEdgesDropped",
  "watcherRunCalls",
  "watcherCleanSkips",
  "watcherStableSkips",
  "watcherDisposedSkips",
  "watcherExecutions",
  "watcherCleanups",
  "watcherDisposals",
  "contextRunCalls",
  "contextSwitches",
  "contextPropagationEnter",
  "contextPropagationLeave",
  "contextSettledChecks",
  "contextSettledEmits",
  "contextSettledDeferred",
  "sinkInvalidatedEmits",
] as const satisfies readonly RuntimeProfileCounterName[];

function createCounters(): RuntimeProfileCounters {
  const counters = {} as RuntimeProfileCounters;

  for (const name of COUNTER_NAMES) {
    counters[name] = 0;
  }

  return counters;
}

export const runtimeProfileCounters: RuntimeProfileCounters =
  /* @__PURE__ */ createCounters();

export let runtimeProfileCountersEnabled = false;

export function setRuntimeProfilingEnabled(enabled: boolean): void {
  runtimeProfileCountersEnabled = enabled;
}

export function isRuntimeProfilingEnabled(): boolean {
  return runtimeProfileCountersEnabled;
}

export function profileRuntimeCounter(name: RuntimeProfileCounterName): void {
  if (__PROFILE__ && runtimeProfileCountersEnabled) {
    runtimeProfileCounters[name] += 1;
  }
}

export function profileRuntimeReadConsumerPath(isDirty: boolean): void {
  if (__PROFILE__ && runtimeProfileCountersEnabled) {
    if (isDirty) runtimeProfileCounters.readConsumerDirtyPath += 1;
    else runtimeProfileCounters.readConsumerCleanFastPath += 1;
  }
}

export function resetRuntimeProfileCounters(): void {
  for (const name of COUNTER_NAMES) {
    runtimeProfileCounters[name] = 0;
  }
}

export function readRuntimeProfileCounters(): RuntimeProfileCounters {
  return { ...runtimeProfileCounters };
}

export const snapshotRuntimeProfileCounters = readRuntimeProfileCounters;

export function diffRuntimeProfileCounters(
  after: RuntimeProfileCounters,
  before: RuntimeProfileCounters,
): RuntimeProfileCounters {
  const diff = {} as RuntimeProfileCounters;

  for (const name of COUNTER_NAMES) {
    diff[name] = after[name] - before[name];
  }

  return diff;
}

export function profileRuntime<T>(fn: () => T): RuntimeProfileResult<T> {
  const wasEnabled = runtimeProfileCountersEnabled;

  resetRuntimeProfileCounters();
  runtimeProfileCountersEnabled = true;

  try {
    const value = fn();
    return {
      value,
      counters: readRuntimeProfileCounters(),
    };
  } finally {
    runtimeProfileCountersEnabled = wasEnabled;
  }
}

export async function profileRuntimeAsync<T>(
  fn: () => Promise<T>,
): Promise<RuntimeProfileResult<T>> {
  const wasEnabled = runtimeProfileCountersEnabled;

  resetRuntimeProfileCounters();
  runtimeProfileCountersEnabled = true;

  try {
    const value = await fn();
    return {
      value,
      counters: readRuntimeProfileCounters(),
    };
  } finally {
    runtimeProfileCountersEnabled = wasEnabled;
  }
}

export function createRuntimeProfileSession(
  options: RuntimeProfileSessionOptions = {},
): RuntimeProfileSession {
  if (options.reset ?? true) {
    resetRuntimeProfileCounters();
  }

  if (options.enabled ?? true) {
    runtimeProfileCountersEnabled = true;
  }

  const baseline = readRuntimeProfileCounters();

  return {
    baseline,
    read: readRuntimeProfileCounters,
    delta(from = baseline) {
      return diffRuntimeProfileCounters(readRuntimeProfileCounters(), from);
    },
    reset() {
      resetRuntimeProfileCounters();
    },
    stop() {
      const counters = readRuntimeProfileCounters();
      runtimeProfileCountersEnabled = false;
      return counters;
    },
  };
}
