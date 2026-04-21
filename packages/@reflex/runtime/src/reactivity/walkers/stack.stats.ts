export interface RuntimeWalkerStackStats {
  current: number;
  peak: number;
  capacity: number;
}

const STACK_TRIM_MIN_CAPACITY = 256;

let shouldRecomputeStackPeak = 0;
let resumeEdgeStackPeak = 0;

export function noteShouldRecomputeStackUsage(stackTop: number): void {
  if (__DEV__ && stackTop > shouldRecomputeStackPeak) {
    shouldRecomputeStackPeak = stackTop;
  }
}

export function noteResumeEdgeStackUsage(stackTop: number): void {
  if (__DEV__ && stackTop > resumeEdgeStackPeak) {
    resumeEdgeStackPeak = stackTop;
  }
}

export function resetRuntimeWalkerStackStats(): void {
  if (!__DEV__) return;
  shouldRecomputeStackPeak = 0;
  resumeEdgeStackPeak = 0;
}

export function trimWalkerStackIfSparse<T>(
  stack: T[],
  stackHigh: number,
): void {
  const l = stack.length;

  if (l < STACK_TRIM_MIN_CAPACITY || stackHigh > l >> 2) return;

  stack.length = stackHigh;
}

export function readRuntimeWalkerStackStats(
  shouldRecomputeStackHigh: number,
  shouldRecomputeStackCapacity: number,
  resumeStackHigh: number,
  resumeEdgeStackCapacity: number,
): {
  shouldRecompute: RuntimeWalkerStackStats;
  propagate: RuntimeWalkerStackStats;
} {
  if (!__DEV__) {
    return {
      shouldRecompute: {
        current: 0,
        peak: 0,
        capacity: 0,
      },
      propagate: {
        current: 0,
        peak: 0,
        capacity: 0,
      },
    };
  }

  return {
    shouldRecompute: {
      current: shouldRecomputeStackHigh,
      peak: shouldRecomputeStackPeak,
      capacity: shouldRecomputeStackCapacity,
    },
    propagate: {
      current: resumeStackHigh,
      peak: resumeEdgeStackPeak,
      capacity: resumeEdgeStackCapacity,
    },
  };
}
