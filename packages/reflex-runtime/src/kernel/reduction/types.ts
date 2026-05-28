import type { ReactiveNode } from "../shape";

export type GraphReductionMode =
  | "dynamic"
  | "stabilized"
  | "specialized"
  | "static-transition-plan";

export interface GraphReductionOptions {
  enabled?: boolean;
  stableThreshold?: number;
  specializeThreshold?: number;
  staticPlanThreshold?: number;
  stabilizeAfter?: number;
  deoptAfterMismatch?: number;
  cooldownAfterDeopt?: number;
}

export interface NormalizedGraphReductionOptions {
  enabled: boolean;
  stableThreshold: number;
  specializeThreshold: number;
  staticPlanThreshold: number;
  deoptAfterMismatch: number;
  cooldownAfterDeopt: number;
}

export interface GraphReductionState {
  readonly mode: GraphReductionMode;
  readonly stableRuns: number;
  readonly dependencyCount: number;
  readonly s: number;
  readonly deoptCount: number;
  readonly mismatchCount: number;
  readonly cooldownRuns: number;
}

export interface MutableGraphReductionState {
  mode: GraphReductionMode;
  stableRuns: number;
  dependencyCount: number;
  s: number;
  deoptCount: number;
  mismatchCount: number;
  cooldownRuns: number;
  sources: ReactiveNode[];
}
