import { readConsumerLazy } from "@volynets/reflex-runtime/internal";
import { createComputedNode } from "../../infra/factory";
import { AsyncBlocker } from "./errors";
import { AsyncFailureCapture, throwAsyncFailure } from "./failure";
import {
  FrontierBuilder,
  inheritFrontier,
  withFrontierCollector,
  type FrontierSnapshot,
} from "./frontier";

// Ordinary exceptions still fail the sync computation without committing a generation.
export type Evaluation<T> =
  | { readonly kind: "value"; readonly value: T }
  | { readonly kind: "blocked"; readonly blocker: AsyncBlocker }
  | { readonly kind: "error"; readonly error: unknown };

export interface EvaluatedGeneration<T> {
  readonly evaluation: Evaluation<T>;
  readonly frontier: FrontierSnapshot;
}

export function captureEvaluation<T>(
  expression: () => T,
): EvaluatedGeneration<T> {
  const collector = new FrontierBuilder();
  const failureCapture = new AsyncFailureCapture();
  const evaluation = withFrontierCollector(collector, (): Evaluation<T> => {
    try {
      return { kind: "value", value: failureCapture.run(expression) };
    } catch (error) {
      if (failureCapture.matches(error)) return { kind: "error", error };
      if (!(error instanceof AsyncBlocker)) throw error;
      return { kind: "blocked", blocker: error };
    }
  });
  return { evaluation, frontier: collector.snapshot() };
}

export function unwrap<T>(evaluation: Evaluation<T>): T {
  if (evaluation.kind === "blocked") throw evaluation.blocker;
  if (evaluation.kind === "error") throwAsyncFailure(evaluation.error);
  return evaluation.value;
}

/** Internal adapter: establish the graph edge and inherit this generation before throwing. */
export function createEvaluatedComputed<T>(expression: () => T): () => T {
  const node = createComputedNode(() => captureEvaluation(expression));
  const read = readConsumerLazy.bind(node) as () => EvaluatedGeneration<T>;
  return () => {
    const generation = read();
    inheritFrontier(generation.frontier);
    return unwrap(generation.evaluation);
  };
}
