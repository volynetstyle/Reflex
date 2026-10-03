import { readConsumerLazy } from "@volynets/reflex-runtime/internal";
import { createComputedNode } from "../factory";
import { AsyncBlocker } from "./errors";
import { AsyncFailureCapture, throwAsyncFailure } from "./failure";
import {
  FrontierBuilder,
  sameFrontierShape,
  inheritFrontier,
  withFrontierCollector,
  type EvaluationFrontier,
} from "./frontier";

// Ordinary exceptions still fail the sync computation without committing a generation.
export type Evaluation<T> =
  | { readonly kind: "value"; readonly value: T }
  | { readonly kind: "blocked"; readonly blocker: AsyncBlocker }
  | { readonly kind: "error"; readonly error: unknown };

export interface EvaluatedGeneration<T> {
  readonly evaluation: Evaluation<T>;
  readonly frontier: EvaluationFrontier;
}

/** Optional semantic counters used only by internal profiling probes. */
export interface EvaluationMetrics {
  generationRecomputes: number;
  semanticEqualRecomputes: number;
  frontierEqualRecomputes: number;
  frontierChangedRecomputes: number;
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

function equalEvaluation<T>(
  left: Evaluation<T>,
  right: Evaluation<T>,
): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "value":
      return right.kind === "value" && Object.is(left.value, right.value);
    case "blocked":
      return right.kind === "blocked" && left.blocker === right.blocker;
    case "error":
      return right.kind === "error" && Object.is(left.error, right.error);
  }
}

/** Internal adapter: establish the graph edge and inherit this generation before throwing. */
export function createEvaluatedComputed<T>(
  expression: () => T,
  metrics?: EvaluationMetrics,
): () => T {
  let previous: EvaluatedGeneration<T> | undefined;
  const node = createComputedNode(() => {
    const next = captureEvaluation(expression);
    if (metrics !== undefined && previous !== undefined) {
      ++metrics.generationRecomputes;
      const sameFrontier = sameFrontierShape(previous.frontier, next.frontier);
      if (sameFrontier) ++metrics.frontierEqualRecomputes;
      else ++metrics.frontierChangedRecomputes;
      if (sameFrontier && equalEvaluation(previous.evaluation, next.evaluation))
        ++metrics.semanticEqualRecomputes;
    }
    if (metrics !== undefined) previous = next;
    return next;
  });
  const read = readConsumerLazy.bind(node) as () => EvaluatedGeneration<T>;
  return () => {
    const generation = read();
    inheritFrontier(generation.frontier);
    return unwrap(generation.evaluation);
  };
}
