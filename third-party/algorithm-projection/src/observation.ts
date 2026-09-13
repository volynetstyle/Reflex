export type ObservationId = `projection.${"raw" | "semantic"}.${string}`;

export interface ProjectionObservation<T = unknown> {
  readonly id: ObservationId;
  readonly kind:
    | "function-entry"
    | "function-exit"
    | "branch"
    | "state-transition"
    | "stack-push"
    | "stack-pop"
    | "semantic";
  readonly payload: T;
}

export type ProjectionObserver = (observation: ProjectionObservation) => void;
