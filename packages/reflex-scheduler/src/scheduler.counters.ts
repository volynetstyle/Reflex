const SCHEDULER_PROFILE_ENABLED =
  typeof __PROFILE__ !== "undefined" && __PROFILE__;

export interface SchedulerPolicyCounters {
  batchEnter: number;
  batchExit: number;
  flushCalled: number;
  flushReturnedEmpty: number;
  flushPasses: number;
  flushCompleted: number;
  settleCalled: number;
  schedulerQueueChecked: number;
  scheduleAttempts: number;
  scheduleDedupSkipped: number;
  effectsScheduled: number;
  effectsRun: number;
  disposedEffectsSkipped: number;
  queueEnqueues: number;
  queueDequeues: number;
  queueGrows: number;
  queuePeakDepth: number;
  queuePeakCapacity: number;
  pendingWatcherChecks: number;
}

export type SchedulerPolicyCounterName = keyof SchedulerPolicyCounters;

function createSchedulerPolicyCounters(): SchedulerPolicyCounters {
  return {
    batchEnter: 0,
    batchExit: 0,
    flushCalled: 0,
    flushReturnedEmpty: 0,
    flushPasses: 0,
    flushCompleted: 0,
    settleCalled: 0,
    schedulerQueueChecked: 0,
    scheduleAttempts: 0,
    scheduleDedupSkipped: 0,
    effectsScheduled: 0,
    effectsRun: 0,
    disposedEffectsSkipped: 0,
    queueEnqueues: 0,
    queueDequeues: 0,
    queueGrows: 0,
    queuePeakDepth: 0,
    queuePeakCapacity: 0,
    pendingWatcherChecks: 0,
  };
}

export const schedulerPolicyCounters: SchedulerPolicyCounters =
  /* @__PURE__ */ createSchedulerPolicyCounters();

export let schedulerPolicyCountersEnabled = false;

export function setSchedulerPolicyCountersEnabled(enabled: boolean): void {
  schedulerPolicyCountersEnabled = enabled;
}

export function profileSchedulerPolicyCounter(
  name: SchedulerPolicyCounterName,
): void {
  if (SCHEDULER_PROFILE_ENABLED && schedulerPolicyCountersEnabled) {
    schedulerPolicyCounters[name] += 1;
  }
}

export function profileSchedulerPolicyMax(
  name: "queuePeakDepth" | "queuePeakCapacity",
  value: number,
): void {
  if (
    SCHEDULER_PROFILE_ENABLED &&
    schedulerPolicyCountersEnabled &&
    value > schedulerPolicyCounters[name]
  ) {
    schedulerPolicyCounters[name] = value;
  }
}

export function resetSchedulerPolicyCounters(): void {
  for (const name of Object.keys(
    schedulerPolicyCounters,
  ) as SchedulerPolicyCounterName[]) {
    schedulerPolicyCounters[name] = 0;
  }
}

export function readSchedulerPolicyCounters(): SchedulerPolicyCounters {
  return { ...schedulerPolicyCounters };
}
