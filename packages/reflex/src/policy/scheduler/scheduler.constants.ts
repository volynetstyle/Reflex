import { Scheduled } from "@volynets/reflex-runtime";

export const enum EffectSchedulerMode {
  Flush = 0,
  Eager = 1,
  SAB = 2,
}

export const Idle = 1 << 0;
export const Batching = 1 << 1;
export const Flushing = 1 << 2;

export const UNSCHEDULE_MASK = ~Scheduled;
