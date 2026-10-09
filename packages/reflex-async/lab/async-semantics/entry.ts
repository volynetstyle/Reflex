import { createEvaluatedComputed } from "../../src/async/evaluation";
import {
  computed,
  createRuntime,
  effect,
  signal,
} from "../../tests/reflex.test_utils";
import { untracked } from "@volynets/reflex-runtime/internal";
import {
  asyncDerived,
  AsyncBlocker,
  AsyncDisposedError,
} from "../../src/index";
import { evaluate, evaluatedComputed, unwrap } from "./evaluation";
import {
  beforeDependencyValidation,
  beforePublicationValidation,
  getPublicationValidationCalls,
  resetPublicationValidationCalls,
  resetValidationHooks,
} from "./frontier";
import { runBoundedDifferential, type Schedule } from "./async-spec-machine";
import { runPendingCaptureDifferential } from "./pending-capture-machine";

declare const __ASYNC_LAB_VARIANT__: "A" | "B1" | "B2" | "B" | "B3" | "C";
declare const __ASYNC_LAB_PRODUCTION__: boolean;
export const variant = __ASYNC_LAB_VARIANT__;
export const derive: <T>(expression: () => T) => () => T =
  __ASYNC_LAB_PRODUCTION__
    ? createEvaluatedComputed
    : variant.startsWith("B")
      ? (expression) =>
          evaluatedComputed(expression, variant as "B" | "B1" | "B2" | "B3")
      : computed;
export {
  computed,
  untracked,
  createRuntime,
  effect,
  signal,
  asyncDerived,
  AsyncBlocker,
  AsyncDisposedError,
  evaluate,
  unwrap,
};
export { runCorpus } from "./correctness";
export {
  beforeDependencyValidation,
  beforePublicationValidation,
  getPublicationValidationCalls,
  resetValidationHooks,
  resetPublicationValidationCalls,
} from "./frontier";

const specApi = {
  createRuntime,
  asyncDerived,
  derive,
  signal,
  untracked,
  beforeDependencyValidation,
  beforePublicationValidation,
  getPublicationValidationCalls,
  resetPublicationValidationCalls,
  resetValidationHooks,
};

export function runBoundedFrontierDifferential(schedule: Schedule) {
  return runBoundedDifferential(specApi, schedule);
}

export function runBoundedCachedFrontierDifferential(schedule: Schedule) {
  return runBoundedDifferential(specApi, schedule, "cached");
}

export function runBoundedPendingCaptureDifferential(schedule: Schedule) {
  return runPendingCaptureDifferential(specApi, schedule);
}
