export interface SchedulerPolicyCounters {
  batchExit: number;
  flushCalled: number;
  flushReturnedEmpty: number;
  settleCalled: number;
  schedulerQueueChecked: number;
  effectsScheduled: number;
  effectsRun: number;
  pendingWatcherChecks: number;
}

export type SchedulerPolicyCounterName = keyof SchedulerPolicyCounters;

function createSchedulerPolicyCounters(): SchedulerPolicyCounters {
  return {
    batchExit: 0,
    flushCalled: 0,
    flushReturnedEmpty: 0,
    settleCalled: 0,
    schedulerQueueChecked: 0,
    effectsScheduled: 0,
    effectsRun: 0,
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
  if (__PROFILE__ && schedulerPolicyCountersEnabled) {
    schedulerPolicyCounters[name] += 1;
  }
}

export function resetSchedulerPolicyCounters(): void {
  schedulerPolicyCounters.batchExit = 0;
  schedulerPolicyCounters.flushCalled = 0;
  schedulerPolicyCounters.flushReturnedEmpty = 0;
  schedulerPolicyCounters.settleCalled = 0;
  schedulerPolicyCounters.schedulerQueueChecked = 0;
  schedulerPolicyCounters.effectsScheduled = 0;
  schedulerPolicyCounters.effectsRun = 0;
  schedulerPolicyCounters.pendingWatcherChecks = 0;
}

export function readSchedulerPolicyCounters(): SchedulerPolicyCounters {
  return { ...schedulerPolicyCounters };
}
