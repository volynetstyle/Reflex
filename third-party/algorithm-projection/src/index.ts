export { analyzeFile, analyzeSource } from "./extract.js";
export { createInstrumentationPlan } from "./plan.js";
export { printProjection } from "./print.js";
export type {
  ObservationId,
  ProjectionObservation,
  ProjectionObserver,
} from "./observation.js";
export type {
  AlgorithmProjection,
  AnalyzeFileOptions,
  AnalyzeSourceOptions,
  BranchFact,
  CallEffect,
  CfgNode,
  ControlFlowGraph,
  InstrumentationPlan,
  LinkedTraversal,
  LoopFact,
  ObservationPoint,
  ObservationPointKind,
  ReadEffect,
  SourceEvidence,
  SourceLocation,
  StackCandidate,
  StateTransition,
  WriteEffect,
} from "./model.js";
