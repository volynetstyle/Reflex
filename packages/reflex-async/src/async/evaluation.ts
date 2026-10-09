import { readConsumerLazy } from "@volynets/reflex-runtime/internal";
import { createComputedNode } from "../factory";
import { AsyncBlocker } from "./errors";
import { AsyncFailureCapture, throwAsyncFailure } from "./failure";
import {
  FrontierBuilder,
  inheritFrontier,
  sameFrontierShape,
  withFrontierCollector,
  type EvaluationFrontier,
} from "./frontier";

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

// PERF IDEA: capture currently allocates a FrontierBuilder and
// AsyncFailureCapture per generation. Reuse may be possible if their
// state can be reset without aliasing retained generation state.
export function captureEvaluation<T>(
  expression: () => T,
): EvaluatedGeneration<T> {
  const collector = new FrontierBuilder();
  const failureCapture = new AsyncFailureCapture();

  const evaluation = withFrontierCollector(collector, (): Evaluation<T> => {
    try {
      return {
        kind: "value",
        value: failureCapture.run(expression),
      };
    } catch (error) {
      if (failureCapture.matches(error)) {
        return { kind: "error", error };
      }

      if (error instanceof AsyncBlocker) {
        return { kind: "blocked", blocker: error };
      }

      throw error;
    }
  });

  return {
    evaluation,
    frontier: collector.snapshot(),
  };
}

export function unwrap<T>(evaluation: Evaluation<T>): T {
  if (evaluation.kind === "value") {
    return evaluation.value;
  }

  if (evaluation.kind === "blocked") {
    throw evaluation.blocker;
  }

  throwAsyncFailure(evaluation.error);
}

function equalEvaluation<T>(
  left: Evaluation<T>,
  right: Evaluation<T>,
): boolean {
  if (left.kind !== right.kind) return false;

  switch (left.kind) {
    case "value":
      return Object.is(left.value, (right as typeof left).value);

    case "blocked":
      return left.blocker === (right as typeof left).blocker;

    case "error":
      return Object.is(left.error, (right as typeof left).error);
  }
}

function createProfiledEvaluation<T>(
  expression: () => T,
  metrics: EvaluationMetrics,
): () => EvaluatedGeneration<T> {
  let previous: EvaluatedGeneration<T> | undefined;

  return () => {
    const next = captureEvaluation(expression);

    if (previous !== undefined) {
      ++metrics.generationRecomputes;

      const sameFrontier = sameFrontierShape(previous.frontier, next.frontier);

      if (sameFrontier) {
        ++metrics.frontierEqualRecomputes;

        if (equalEvaluation(previous.evaluation, next.evaluation)) {
          ++metrics.semanticEqualRecomputes;
        }
      } else {
        ++metrics.frontierChangedRecomputes;
      }
    }

    previous = next;
    return next;
  };
}

/** Internal adapter: establish the graph edge and inherit this generation before throwing. */
export function createEvaluatedComputed<T>(
  expression: () => T,
  metrics?: EvaluationMetrics,
): () => T {
  const compute =
    metrics === undefined
      ? () => captureEvaluation(expression)
      : createProfiledEvaluation(expression, metrics);

  const node = createComputedNode(compute);

  const read = readConsumerLazy.bind(node) as () => EvaluatedGeneration<T>;
  return () => {
    const generation = read();
    inheritFrontier(generation.frontier);
    return unwrap(generation.evaluation);
  };
}
