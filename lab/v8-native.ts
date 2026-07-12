/* eslint-disable @typescript-eslint/no-explicit-any */

// Refference: https://chromium.googlesource.com/v8/v8/+/refs/heads/main/src/runtime/runtime.h

// * Each intrinsic is exposed in JavaScript via:
//    * %#name, which is always a runtime call.
//    * (optionally) %_#name, which can be inlined or just a runtime call, the
//      compiler in question decides.

// * IntrinsicTypes are Runtime::RUNTIME and Runtime::INLINE, respectively.
//
// * IDs are Runtime::k##name and Runtime::kInline##name, respectively.
//
// * All intrinsics have a C++ implementation Runtime_##name.
//
// * Each compiler has an explicit list of intrinsics it supports, falling back
//   to a simple runtime call if necessary.

// Entries have the form F(name, number of arguments, number of return values):
// A variable number of arguments is specified by a -1, additional restrictions
// are specified by inline comments. To declare only the runtime version (no
// inline), use the F macro below. To declare the runtime version and the inline
// version simultaneously, use the I macro below.

export type AnyFunction = (...args: any[]) => any;

export type OptimizationStatus = number;

export interface V8CallResult<T> {
  ok: boolean;
  value?: T;
  error?: unknown;
}

export interface OptimizationSnapshot {
  label: string;
  status: OptimizationStatus;
  hex: string;
  binary: string;
  activeBits: number[];
  probablyOptimized: boolean;
}

/**
 * V8 native intrinsics wrapper.
 *
 * Requires:
 *
 *   node --allow-natives-syntax ...
 *
 * Important:
 * - These APIs are V8-internal.
 * - Status bit meanings are not stable across V8 versions.
 * - Use trace-opt / trace-deopt logs as stronger evidence than status decoding.
 */
export interface V8NativeApi {
  isAvailable(): boolean;

  haveSameMap(a: object, b: object): boolean;
  hasFastProperties(obj: object): boolean;

  prepareFunctionForOptimization(fn: AnyFunction): void;
  optimizeFunctionOnNextCall(fn: AnyFunction): void;
  neverOptimizeFunction(fn: AnyFunction): void;
  deoptimizeFunction(fn: AnyFunction): void;
  deoptimizeNow(): void;

  getOptimizationStatus(fn: AnyFunction): OptimizationStatus;

  debugPrint(value: unknown): void;
}

function formatNativeError(name: string, error: unknown): Error {
  const message =
    `[V8Native.${name}] is not available.\n` +
    `Run Node with:\n\n` +
    `  node --allow-natives-syntax --trace-opt --trace-deopt <file>\n\n` +
    `Original error: ${String(error)}`;

  return new Error(message, { cause: error });
}

/**
 * Lazy native creation.
 *
 * This is important: importing this file without --allow-natives-syntax
 * should not immediately explode. The explosion is delayed until the native
 * function is actually called, because apparently we now do diplomacy with V8.
 */
function createNative<T extends AnyFunction>(name: string, source: string): T {
  let nativeFn: T | undefined;

  return function nativeWrapper(
    this: unknown,
    ...args: Parameters<T>
  ): ReturnType<T> {
    if (nativeFn === undefined) {
      try {
        nativeFn = Function(`"use strict";\n${source}`)() as T;
      } catch (error) {
        throw formatNativeError(name, error);
      }
    }

    return nativeFn.apply(this, args) as ReturnType<T>;
  } as T;
}

function tryCall<T>(fn: () => T): V8CallResult<T> {
  try {
    return {
      ok: true,
      value: fn(),
    };
  } catch (error) {
    return {
      ok: false,
      error,
    };
  }
}

const nativeHaveSameMap = createNative<(a: object, b: object) => boolean>(
  "haveSameMap",
  `
  return function haveSameMap(a, b) {
    return %HaveSameMap(a, b);
  };
  `,
);

const nativeHasFastProperties = createNative<(obj: object) => boolean>(
  "hasFastProperties",
  `
  return function hasFastProperties(obj) {
    return %HasFastProperties(obj);
  };
  `,
);

const nativePrepareFunctionForOptimization = createNative<
  (fn: AnyFunction) => void
>(
  "prepareFunctionForOptimization",
  `
  return function prepareFunctionForOptimization(fn) {
    %PrepareFunctionForOptimization(fn);
  };
  `,
);

const nativeOptimizeFunctionOnNextCall = createNative<
  (fn: AnyFunction) => void
>(
  "optimizeFunctionOnNextCall",
  `
  return function optimizeFunctionOnNextCall(fn) {
    %OptimizeFunctionOnNextCall(fn);
  };
  `,
);

const nativeNeverOptimizeFunction = createNative<(fn: AnyFunction) => void>(
  "neverOptimizeFunction",
  `
  return function neverOptimizeFunction(fn) {
    %NeverOptimizeFunction(fn);
  };
  `,
);

const nativeDeoptimizeFunction = createNative<(fn: AnyFunction) => void>(
  "deoptimizeFunction",
  `
  return function deoptimizeFunction(fn) {
    %DeoptimizeFunction(fn);
  };
  `,
);

const nativeDeoptimizeNow = createNative<() => void>(
  "deoptimizeNow",
  `
  return function deoptimizeNow() {
    %DeoptimizeNow();
  };
  `,
);

const nativeGetOptimizationStatus = createNative<
  (fn: AnyFunction) => OptimizationStatus
>(
  "getOptimizationStatus",
  `
  return function getOptimizationStatus(fn) {
    return %GetOptimizationStatus(fn);
  };
  `,
);

const nativeDebugPrint = createNative<(value: unknown) => void>(
  "debugPrint",
  `
  return function debugPrint(value) {
    %DebugPrint(value);
  };
  `,
);

let availabilityCache: boolean | undefined;

export const V8Native: V8NativeApi = {
  isAvailable(): boolean {
    if (availabilityCache !== undefined) {
      return availabilityCache;
    }

    const result = tryCall(() => nativeHaveSameMap({}, {}));
    availabilityCache = result.ok && result.value === true;

    return availabilityCache;
  },

  haveSameMap(a: object, b: object): boolean {
    return nativeHaveSameMap(a, b);
  },

  hasFastProperties(obj: object): boolean {
    return nativeHasFastProperties(obj);
  },

  prepareFunctionForOptimization(fn: AnyFunction): void {
    nativePrepareFunctionForOptimization(fn);
  },

  optimizeFunctionOnNextCall(fn: AnyFunction): void {
    nativeOptimizeFunctionOnNextCall(fn);
  },

  neverOptimizeFunction(fn: AnyFunction): void {
    nativeNeverOptimizeFunction(fn);
  },

  deoptimizeFunction(fn: AnyFunction): void {
    nativeDeoptimizeFunction(fn);
  },

  deoptimizeNow(): void {
    nativeDeoptimizeNow();
  },

  getOptimizationStatus(fn: AnyFunction): OptimizationStatus {
    return nativeGetOptimizationStatus(fn);
  },

  debugPrint(value: unknown): void {
    nativeDebugPrint(value);
  },
};

// -----------------------------------------------------------------------------
// Status helpers
// -----------------------------------------------------------------------------

export function getActiveBits(status: OptimizationStatus): number[] {
  const bits: number[] = [];

  for (let bit = 0; bit < 31; bit++) {
    if ((status & (1 << bit)) !== 0) {
      bits.push(bit);
    }
  }

  return bits;
}

/**
 * Conservative helper.
 *
 * FACT:
 * - V8 returns a numeric bitmask from %GetOptimizationStatus.
 *
 * LIMITATION:
 * - Exact bit meanings are V8-version-dependent.
 * - Treat this as a quick lab signal, not as a formal proof.
 */
export function isProbablyOptimized(status: OptimizationStatus): boolean {
  return (status & 1) !== 0;
}

export function snapshotOptimizationStatus(
  label: string,
  fn: AnyFunction,
): OptimizationSnapshot {
  const status = V8Native.getOptimizationStatus(fn);

  return {
    label,
    status,
    hex: `0x${status.toString(16)}`,
    binary: `0b${status.toString(2)}`,
    activeBits: getActiveBits(status),
    probablyOptimized: isProbablyOptimized(status),
  };
}

export function printOptimizationStatus(label: string, fn: AnyFunction): void {
  const snapshot = snapshotOptimizationStatus(label, fn);

  console.log(
    `[opt-status] ${snapshot.label}: ` +
      `status=${snapshot.status} ` +
      `hex=${snapshot.hex} ` +
      `bits=[${snapshot.activeBits.join(", ")}] ` +
      `probablyOptimized=${snapshot.probablyOptimized}`,
  );
}

// -----------------------------------------------------------------------------
// Shape helpers
// -----------------------------------------------------------------------------

export interface ShapeReport {
  label: string;
  sameMap: boolean;
  leftFastProperties: boolean;
  rightFastProperties: boolean;
}

export function compareObjectShape(
  label: string,
  left: object,
  right: object,
): ShapeReport {
  return {
    label,
    sameMap: V8Native.haveSameMap(left, right),
    leftFastProperties: V8Native.hasFastProperties(left),
    rightFastProperties: V8Native.hasFastProperties(right),
  };
}

export function printShapeReport(
  label: string,
  left: object,
  right: object,
): void {
  const report = compareObjectShape(label, left, right);

  console.log(`[shape] ${report.label}`);
  console.log(`  sameMap             : ${report.sameMap}`);
  console.log(`  leftFastProperties  : ${report.leftFastProperties}`);
  console.log(`  rightFastProperties : ${report.rightFastProperties}`);
}

export function assertSameMap(
  label: string,
  left: object,
  right: object,
): void {
  if (!V8Native.haveSameMap(left, right)) {
    console.error(`[shape-fail] ${label}`);
    console.error("Left object:");
    V8Native.debugPrint(left);
    console.error("Right object:");
    V8Native.debugPrint(right);

    throw new Error(
      `[shape-fail] ${label}: objects do not have the same V8 map`,
    );
  }
}

export function assertFastProperties(label: string, obj: object): void {
  if (!V8Native.hasFastProperties(obj)) {
    console.error(`[fast-props-fail] ${label}`);
    V8Native.debugPrint(obj);

    throw new Error(
      `[fast-props-fail] ${label}: object is not in fast properties mode`,
    );
  }
}

// -----------------------------------------------------------------------------
// Warmup / optimization helpers
// -----------------------------------------------------------------------------

export interface OptimizeReport {
  label: string;
  before: OptimizationSnapshot;
  after: OptimizationSnapshot;
}

export function warmup(call: () => void, iterations = 100_000): void {
  for (let i = 0; i < iterations; i++) {
    call();
  }
}
V8Native.neverOptimizeFunction(warmup);

/**
 * Canonical optimization pattern:
 *
 * 1. prepare function
 * 2. warm up
 * 3. optimize on next call
 * 4. call once
 * 5. read status
 */
export function optimizeWithWarmup(
  label: string,
  fn: AnyFunction,
  warmCall: () => void,
  optimizedCall: () => void = warmCall,
  iterations = 100_000,
): OptimizeReport {
  V8Native.prepareFunctionForOptimization(fn);

  const before = snapshotOptimizationStatus(`${label}:before`, fn);

  warmup(warmCall, iterations);

  V8Native.optimizeFunctionOnNextCall(fn);
  optimizedCall();

  const after = snapshotOptimizationStatus(`${label}:after`, fn);

  return {
    label,
    before,
    after,
  };
}

export function printOptimizeReport(report: OptimizeReport): void {
  console.log(`[opt-report] ${report.label}`);

  console.log(
    `  before: status=${report.before.status} ` +
      `hex=${report.before.hex} ` +
      `bits=[${report.before.activeBits.join(", ")}] ` +
      `probablyOptimized=${report.before.probablyOptimized}`,
  );

  console.log(
    `  after : status=${report.after.status} ` +
      `hex=${report.after.hex} ` +
      `bits=[${report.after.activeBits.join(", ")}] ` +
      `probablyOptimized=${report.after.probablyOptimized}`,
  );
}

// -----------------------------------------------------------------------------
// Scenario helper
// -----------------------------------------------------------------------------

export interface ShapeTransitionScenario<
  TWarm extends object,
  TTest extends object,
> {
  label: string;
  fn: (node: TWarm | TTest) => unknown;
  warmNode: TWarm;
  testNode: TTest;
  iterations?: number;
}

/**
 * Tests a common runtime question:
 *
 * "If I optimize a hot function on one node shape, then pass another node kind,
 * does the status collapse immediately?"
 *
 * This does not replace --trace-deopt.
 * It gives structured local output around the call site.
 */
export function runShapeTransitionScenario<
  TWarm extends object,
  TTest extends object,
>(scenario: ShapeTransitionScenario<TWarm, TTest>): void {
  const { label, fn, warmNode, testNode, iterations = 100_000 } = scenario;

  console.log("");
  console.log(`V8 SHAPE TRANSITION SCENARIO: ${label}`);
  console.log("======================================");

  printShapeReport(`${label}: warm vs test`, warmNode, testNode);

  assertFastProperties(`${label}: warmNode`, warmNode);
  assertFastProperties(`${label}: testNode`, testNode);

  V8Native.prepareFunctionForOptimization(fn);

  warmup(() => {
    fn(warmNode);
  }, iterations);

  V8Native.optimizeFunctionOnNextCall(fn);
  fn(warmNode);

  printOptimizationStatus(`${label}: after warm node`, fn);

  fn(testNode);

  printOptimizationStatus(`${label}: after test node`, fn);

  console.log(
    "Note: use --trace-deopt and parser output as the final source of truth.",
  );
}
