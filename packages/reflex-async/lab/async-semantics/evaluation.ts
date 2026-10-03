import { computed } from "@volynets/reflex";
import { AsyncBlocker } from "../../src/index";
import {
  captureFrontier,
  collectFrontier,
  isAsyncCaptureActive,
  isFrontierCollectionActive,
  validateFrontier,
  type AsyncFrontierDependency,
} from "./frontier";

export type Evaluation<T> =
  | { readonly kind: "value"; readonly value: T }
  | { readonly kind: "blocked"; readonly blocker: AsyncBlocker }
  | { readonly kind: "error"; readonly error: unknown };

/** Experimental consumer result, outside the producer protocol. */
export function evaluate<T>(expression: () => T): Evaluation<T> {
  try {
    return { kind: "value", value: expression() };
  } catch (error) {
    return error instanceof AsyncBlocker
      ? { kind: "blocked", blocker: error }
      : { kind: "error", error };
  }
}

export function unwrap<T>(result: Evaluation<T>): T {
  switch (result.kind) {
    case "value":
      return result.value;
    case "blocked":
      throw result.blocker;
    case "error":
      throw result.error;
  }
}

/** Caches execution status; a blocker is thrown only after the consumer read. */
export type EvaluationMode = "B" | "B1" | "B2" | "B3";

export function evaluatedComputed<T>(
  expression: () => T,
  mode: EvaluationMode = "B",
): () => T {
  const dependencies = new Set<AsyncFrontierDependency>();
  const result = computed(() => {
    // Keep the frontier container stable. B3 must copy its members into the
    // active attempt, so a later recomputation cannot rewrite that attempt's
    // proof obligations through a shared mutable Set.
    dependencies.clear();
    return evaluate(() => captureFrontier(dependencies, expression));
  });
  return () => {
    const current = result();
    // B1 isolates stable evaluation. B2 validates only when an async consumer
    // needs freshness proof. B3 records that proof for the publish checkpoint.
    if (mode === "B1") return unwrap(current);

    if (mode === "B2" && isAsyncCaptureActive()) {
      unwrap(evaluate(() => validateFrontier(dependencies)));
    }

    if (
      mode === "B3" &&
      (isAsyncCaptureActive() || isFrontierCollectionActive())
    ) {
      collectFrontier(dependencies);
    }

    if (mode === "B") {
      const validation = evaluate(() => validateFrontier(dependencies));
      if (validation.kind !== "value") return unwrap(validation);
    }
    return unwrap(current);
  };
}
