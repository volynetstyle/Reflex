/**
 * https://chromium.googlesource.com/v8/v8/+/refs/heads/main/src/runtime/runtime.h#977
 */
export const kNotFound: number = -1;

/**
 * https://chromium.googlesource.com/v8/v8/+/refs/heads/main/src/runtime/runtime.h#1123
 */
export const enum V8OptimizationStatus {
  kIsFunction = 1 << 0,
  kNeverOptimize = 1 << 1,
  kMaybeDeopted = 1 << 2,
  kOptimized = 1 << 3,
  kMaglevved = 1 << 4,
  kTurboFanned = 1 << 5,
  kInterpreted = 1 << 6,
  kMarkedForOptimization = 1 << 7,
  kMarkedForConcurrentOptimization = 1 << 8,
  kOptimizingConcurrently = 1 << 9,
  kIsExecuting = 1 << 10,
  kTopmostFrameIsTurboFanned = 1 << 11,
  kLiteMode = 1 << 12,
  kMarkedForDeoptimization = 1 << 13,
  kBaseline = 1 << 14,
  kTopmostFrameIsInterpreted = 1 << 15,
  kTopmostFrameIsBaseline = 1 << 16,
  kIsLazy = 1 << 17,
  kTopmostFrameIsMaglev = 1 << 18,
  kOptimizeOnNextCallOptimizesToMaglev = 1 << 19,
  kOptimizeMaglevOptimizesToTurbofan = 1 << 20,
  kMarkedForMaglevOptimization = 1 << 21,
  kMarkedForConcurrentMaglevOptimization = 1 << 22,
}

export function isOptimized(status: number): boolean {
  return (status & V8OptimizationStatus.kOptimized) !== 0;
}

export function isTurboFanned(status: number): boolean {
  return (status & V8OptimizationStatus.kTurboFanned) !== 0;
}

export function isMaglevved(status: number): boolean {
  return (status & V8OptimizationStatus.kMaglevved) !== 0;
}

export function isInterpreted(status: number): boolean {
  return (status & V8OptimizationStatus.kInterpreted) !== 0;
}
