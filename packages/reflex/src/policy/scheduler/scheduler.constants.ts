import { ReactiveNodeState } from "@reflex/runtime";

export const enum EffectSchedulerMode {
  Flush = 0,
  Eager = 1,
  SAB = 2,
  Ranked = 3,
}

export const enum SchedulerPhase {
  Idle = 0,
  Batching = 1,
  Flushing = 2,
}

export const SCHEDULED_OR_DISPOSED =
  ReactiveNodeState.Disposed | ReactiveNodeState.Scheduled;
export const UNSCHEDULE_MASK = ~ReactiveNodeState.Scheduled;
