import { untracked } from "@volynets/reflex-runtime/internal";

/** Only the B build instruments AsyncSource.read to report these handles. */
export interface AsyncFrontierDependency {
  ensure(): void;
  track(): void;
}
let collector: Set<AsyncFrontierDependency> | undefined;
let asyncCaptureDepth = 0;
let publicationValidationCalls = 0;
let beforePublicationValidationHook: (() => void) | undefined;
let beforeDependencyValidationHook:
  | ((dependency: AsyncFrontierDependency) => void)
  | undefined;

/** Marks only the synchronous body that captures an AsyncExecution. */
export function withAsyncCapture<T>(fn: () => T): T {
  ++asyncCaptureDepth;
  try {
    return fn();
  } finally {
    --asyncCaptureDepth;
  }
}

export function isAsyncCaptureActive(): boolean {
  return asyncCaptureDepth !== 0;
}

export function isFrontierCollectionActive(): boolean {
  return collector !== undefined;
}

export function resetPublicationValidationCalls(): void {
  publicationValidationCalls = 0;
}

export function getPublicationValidationCalls(): number {
  return publicationValidationCalls;
}

export function recordPublicationValidation(): void {
  ++publicationValidationCalls;
}

export function beforePublicationValidation(hook: () => void): void {
  beforePublicationValidationHook = hook;
}

export function beforeDependencyValidation(
  hook: (dependency: AsyncFrontierDependency) => void,
): void {
  beforeDependencyValidationHook = hook;
}

export function runBeforePublicationValidation(): void {
  const hook = beforePublicationValidationHook;
  beforePublicationValidationHook = undefined;
  hook?.();
}

export function runBeforeDependencyValidation(
  dependency: AsyncFrontierDependency,
): void {
  const hook = beforeDependencyValidationHook;
  beforeDependencyValidationHook = undefined;
  hook?.(dependency);
}

export function resetValidationHooks(): void {
  beforePublicationValidationHook = undefined;
  beforeDependencyValidationHook = undefined;
}

export function recordAsyncRead(dependency: AsyncFrontierDependency): void {
  collector?.add(dependency);
}

export function captureFrontier<T>(
  dependencies: Set<AsyncFrontierDependency>,
  expression: () => T,
): T {
  const parent = collector;
  collector = dependencies;
  try {
    return expression();
  } finally {
    collector = parent;
    if (parent !== undefined)
      for (const dependency of dependencies) parent.add(dependency);
  }
}

/** Replay async authority tracking even when a synchronous consumer is cached. */
export function validateFrontier(
  dependencies: Set<AsyncFrontierDependency>,
): void {
  untracked(() => {
    for (const dependency of dependencies) {
      recordAsyncRead(dependency);
      dependency.track();
      dependency.ensure();
    }
  });
}

/** B3 records validation authority without ensuring dependencies at read time. */
export function collectFrontier(
  dependencies: Set<AsyncFrontierDependency>,
): void {
  for (const dependency of dependencies) {
    recordAsyncRead(dependency);
    dependency.track();
  }
}
